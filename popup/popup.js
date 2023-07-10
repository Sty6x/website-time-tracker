const slideBtn = document.getElementById("slide-btn");
const popup = document.querySelector("body");

document.addEventListener("DOMContentLoaded", displayCurrentTab);
async function displayCurrentTab() {
  const [{ url }] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const { trackedSites } = await chrome.storage.local.get(["trackedSites"]);
  const currentActiveTab = trackedSites.find(
    (site) => site.url === new URL(url).hostname
  );
  const header = document.getElementById("website-title");
  let headerText = new URL(url).host.split(".")[1];
  let formatHeaderText = headerText.replace(
    headerText[0],
    headerText.charAt(0).toUpperCase()
  );
  header.textContent = formatHeaderText;
  if (currentActiveTab !== undefined && currentActiveTab.isTracked) {
    slideBtn.classList.replace("isNotTracked", "isTracked");

    console.log(currentActiveTab);
  } else if (currentActiveTab === undefined || !currentActiveTab.isTracked) {
    // if is not in the list of tracked sites and is not tracked
    // dont show data
    // set button to isNotTracked
    // set the url to popup title and set logo
    console.log(url, ": is not tracked and is not stored in db");
  }
}

function animateSlideButton(e) {
  e.preventDefault();
  let target = e.target;
  let animationDuration =
    window.getComputedStyle(target).animationDuration.slice(0, -1) * 1000;
  if (target.classList.contains("isNotTracked")) {
    return target.classList.replace("isNotTracked", "isTracked");
  }
  target.classList.replace("isTracked", "isNotTracked");
}
slideBtn.addEventListener("click", async (e) => {
  console.log("click");
  animateSlideButton(e);
  const send = await chrome.runtime.sendMessage({ track: true });
});
