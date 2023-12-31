import {
	getCurrentActiveTab,
	loadCurrentActiveTrackedTab,
	setCurrentTabToTracked,
	setCurrentTabTotalTime,
} from "./utils/service-worker.utils.js";

chrome.runtime.onInstalled.addListener(({ reason }) => {
	reason === "install" && chrome.storage.local.set({ trackedSites: [] });
});

chrome.runtime.onMessage.addListener(async ({ track }) => {
	if (track) {
		const [{ url }] = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true,
		});
		try {
			const currentActiveTab = await getCurrentActiveTab(url);
			await setCurrentTabToTracked(currentActiveTab);
		} catch (err) {
			console.log("unable to track current tab");
		}
	}
});

chrome.webNavigation.onDOMContentLoaded.addListener(
	async ({ url, frameId }) => {
		const [{ id }] = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true,
		});
		if (frameId === 0) {
			console.log("ready to inject script");
			try {
				await chrome.scripting.executeScript({
					target: { tabId: id },
					files: ["/content-script/connection.js"],
				});
				console.log("successfully injected");
			} catch (err) {
				console.log("unable to inject script");
			}
		}
	}
);

chrome.webNavigation.onDOMContentLoaded.addListener(
	async ({ url, frameId }) => {
		// to only wait for the main frame and not subrframes of first load
		if (frameId === 0) {
			console.log("first visit");
			const { trackedSites } = await chrome.storage.local.get([
				"trackedSites",
			]);
			if (trackedSites.length !== 0) {
				const currentActiveTab = await getCurrentActiveTab(url);
				currentActiveTab !== undefined
					? await loadCurrentActiveTrackedTab(currentActiveTab)
					: null;
			}
		}
	}
);

chrome.runtime.onConnect.addListener(async (port) => {
	if (port.name === "connect") {
		let trackedTabUrl;
		let documentId;
		port.onMessage.addListener(async (msg, { sender }) => {
			console.log(msg);
			trackedTabUrl = sender.url;
			// shouldn't this get the latest document id? of a message sender?
			documentId = sender.documentId;
		});
		// refreshing doesnt disconnect
		port.onDisconnect.addListener(async ({ sender }) => {
			console.log("disconnected");
			if (sender.documentId === documentId) {
				let queryUrl = new URL(sender.url).host;
				console.log(queryUrl);
				const tabs = await chrome.tabs.query({
					url: `https://*.${queryUrl}/*`,
				});
				console.log(tabs);
				const currentActiveTab = await getCurrentActiveTab(trackedTabUrl);
				if (tabs.length === 0 && currentActiveTab !== undefined) {
					await setCurrentTabTotalTime(currentActiveTab);
				}
			}
		});
	}
});

chrome.storage.onChanged.addListener(async () => {
	const date = new Date();
	console.log(date.getHours());
	await chrome.storage.local.get(["trackedSites"]).then(({ trackedSites }) => {
		console.log(trackedSites);
	});
});
