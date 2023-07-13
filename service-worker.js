import { getCurrentActiveTab } from "./utils/service-worker.utils.js";

chrome.runtime.onInstalled.addListener(({ reason }) => {
  reason === "install" && chrome.storage.local.set({ trackedSites: [] });
});

chrome.runtime.onMessage.addListener(async ({ track }) => {
  if (track) {
    const [{ url, title, favIconUrl }] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const currentActiveTab = await getCurrentActiveTab(url);
    const currentTime = Date.now();
    if (currentActiveTab !== undefined) {
      const updateCurrentTab = {
        ...site,
        isTracked: site.isTracked ? false : true,
        timesVisited: site.timesVisited + 1,
        time: {
          ...site.time,
          currentTrackedTime: currentTime,
        },
      };
      const updateTrackedSites = trackedSites.map((site) => {
        site.url.includes(currentActiveTab.url) ? updateCurrentTab : site;
      });
      await chrome.storage.local.set({
        trackedSites: updateTrackedSites,
      });
    } else {
      const createCurrentTabData = {
        url: new URL(url).hostname,
        title,
        favIconUrl,
        isTracked: true,
        timesVisited: 0,
        time: {
          currentTrackedTime: currentTime,
          totalTimeSpent: 0,
          dailyTimeSpent: 0,
        },
      };
      const { trackedSites } = await chrome.storage.local.get(["trackedSites"]);
      await chrome.storage.local.set({
        trackedSites: [createCurrentTabData, ...trackedSites],
      });
    }
  }
});

chrome.history.onVisited.addListener(async () => {
  const [{ id }] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  try {
    await chrome.scripting.executeScript({
      target: { tabId: id },
      files: ["/content-script/connection.js"],
    });
    console.log("successfully injected");
  } catch (err) {
    console.log("unable to inject script");
  }
});

// improve smelly code
chrome.history.onVisited.addListener(async ({ url }) => {
  const { trackedSites } = await chrome.storage.local.get(["trackedSites"]);
  // get tabs array and check each tab if a tab is a the same as the current tab that is to be refreshed,
  // if there are tabs that exist that are the same as the current active one, then dont update the current time
  // and do nothing
  if (trackedSites.length !== 0) {
    const currentActiveTab = await getCurrentActiveTab(url);
    if (currentActiveTab !== undefined) {
      const currentTime = Date.now();
      const updateCurrentTab = {
        ...site,
        timesVisited: site.timesVisited + 1,
        time: {
          ...site.time,
          currentTrackedTime: currentTime,
        },
      };
      await chrome.storage.local.set({
        trackedSites: trackedSites.map((site) => {
          site.url.includes(currentActiveTab.url) && currentActiveTab.isTracked
            ? updateCurrentTab
            : site;
        }),
      });
    }
  } else {
    console.log("tracked sites empty");
  }
});

// another problem:
// when a user is in a homepage of a website and clicks on the navigation links
// to route to another webpage, the connection that was established is still considered
// a single connection from the initial visit (which is good), but if the user disconnects or removes
// the tab, this would call the onDiconnect event `n` times based on how many times
// a user navigates the website

// time is not being tracked because the service worker timed out

chrome.runtime.onConnect.addListener(async (port) => {
  if (port.name === "connect") {
    let trackedTabUrl;
    let documentId;
    port.onMessage.addListener(async (msg, { sender }) => {
      trackedTabUrl = sender.url;
      documentId = sender.documentId;
    });
    port.onDisconnect.addListener(async ({ sender }) => {
      const currentActiveTab = await getCurrentActiveTab(trackedTabUrl);
      if (sender.documentId === documentId && currentActiveTab !== undefined) {
        const currentTime = Date.now();
        const { trackedSites } = await chrome.storage.local.get([
          "trackedSites",
        ]);
        const updatedActiveTab = {
          ...currentActiveTab,
          time: {
            ...currentActiveTab.time,
            totalTimeSpent:
              currentActiveTab.time.totalTimeSpent +
              (currentTime - currentActiveTab.time.currentTrackedTime),
            dailyTimeSpent: 20,
          },
        };
        await chrome.storage.local.set({
          trackedSites: trackedSites.map((site) =>
            site.url === currentActiveTab.url ? updatedActiveTab : site
          ),
        });
        console.log(updatedActiveTab);
      } else {
        console.log("is not in database");
      }
    });
  }
});

chrome.tabs.onRemoved.addListener(async () => {
  console.log("tab removed");
});
