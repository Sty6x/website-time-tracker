import {
	getCurrentActiveTab,
	updateTrackedTabsOnDeleted,
} from "./utils/service-worker.utils.js";

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
		const { trackedSites } = await chrome.storage.local.get(["trackedSites"]);
		const currentTime = Date.now();
		if (currentActiveTab !== undefined) {
			await chrome.storage.local.set({
				trackedSites: trackedSites.map((site) => {
					if (site.url.includes(currentActiveTab.url)) {
						const updateCurrentTab = {
							...site,
							isTracked: site.isTracked ? false : true,
							timesVisited: site.timesVisited + 1,
							time: {
								...site.time,
								currentTrackedTime: currentTime,
							},
						};
						return updateCurrentTab;
					}
					return site;
				}),
			});
		} else {
			const createCurrentTabData = {
				url: new URL(url).hostname,
				title,
				favIconUrl,
				isTracked: true,
				timesVisited: 1,
				time: {
					currentTrackedTime: currentTime,
					totalTimeSpent: 0,
					dailyTimeSpent: 0,
				},
			};
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

chrome.storage.onChanged.addListener(async () => {
	const { trackedSites } = await chrome.storage.local.get(["trackedSites"]);
	console.log(trackedSites);
});

// Logic:
// WHAT IS TRIGGERED ON FIRST VISIT OF USER
// > when a user first visits the page onDOMContentLoad() is triggered (will only trigger once until first visit or refreshed)
//   and setting the currentTrackedTime to current time Date.now()
// > onVisited() is also triggered which calculates the currentTrackedTime and current time (time of visit,refresh or redirections)
// 	*the onVisited() doesnt't matter on first visit since its calculating the time of an insignificant value in milliseconds
//  ( getting totalTime = totalTime + (currentTrackedTime - Date.now()) ) *

// will only trigger on first visit ignoring the back forward cache and navigation
// NOTE: reloading webpage is not ignored
chrome.webNavigation.onDOMContentLoaded.addListener(async ({ url }) => {
	console.log("first visit");
	const { trackedSites } = await chrome.storage.local.get(["trackedSites"]);
	if (trackedSites.length !== 0) {
		const currentActiveTab = await getCurrentActiveTab(url);
		if (currentActiveTab !== undefined) {
			const currentTime = Date.now();
			await chrome.storage.local.set({
				trackedSites: trackedSites.map((site) => {
					if (
						site.url.includes(currentActiveTab.url) &&
						currentActiveTab.isTracked
					) {
						const updateCurrentTab = {
							...site,
							timesVisited: site.timesVisited + 1,
							time: {
								...site.time,
								currentTrackedTime: currentTime,
							},
						};
						return updateCurrentTab;
					}
					return site;
				}),
			});
		}
	} else {
		console.log("tracked sites empty");
	}
});

// this will calculate the time the user visits, navigates or refreshes the page.
chrome.history.onVisited.addListener(async ({ url }) => {
	const currentActiveTab = await getCurrentActiveTab(url);
	if (currentActiveTab !== undefined) {
		await updateTrackedTabsOnDeleted(currentActiveTab);
	} else {
		console.log("is not in database");
	}
});

// navigating in a website and visiting will run the onConnect event (establishes a connection between the injectd script on the host page)
// will establish a connection by injecting the content script on the host page and invoking the connect method.
// refreshing or removing the tab will invoke the onDisconnect listener and calculate the time of visit and time of disconnection.
chrome.runtime.onConnect.addListener(async (port) => {
	if (port.name === "connect") {
		let trackedTabUrl;
		let documentId;
		port.onMessage.addListener(async (msg, { sender }) => {
			console.log(msg);
			trackedTabUrl = sender.url;
			documentId = sender.documentId;
		});
		port.onDisconnect.addListener(async ({ sender }) => {
			console.log("disconnected");
			const currentActiveTab = await getCurrentActiveTab(trackedTabUrl);
			if (
				sender.documentId === documentId &&
				currentActiveTab !== undefined
			) {
				await updateTrackedTabsOnDeleted(currentActiveTab);
			} else {
				console.log("is not in database");
			}
		});
	}
});
