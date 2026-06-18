const APP_PAGE = 'index.html';

function runtimePageUrl() {
  return chrome.runtime.getURL(APP_PAGE);
}

function resolveChromeResult(resolve, value, fallback = null) {
  const err = chrome.runtime?.lastError;
  if (err) console.warn(err.message);
  resolve(err ? fallback : value);
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolveChromeResult(resolve, tabs || [], []));
  });
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve) => {
    if (tabId == null) { resolve(null); return; }
    chrome.tabs.update(tabId, updateProperties, (tab) => resolveChromeResult(resolve, tab || null));
  });
}

function focusWindow(windowId) {
  return new Promise((resolve) => {
    if (windowId == null || !chrome.windows?.update) { resolve(null); return; }
    chrome.windows.update(windowId, { focused: true }, (win) => resolveChromeResult(resolve, win || null));
  });
}

function createAppTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url }, (tab) => resolveChromeResult(resolve, tab || null));
  });
}

chrome.action.onClicked.addListener(async () => {
  const url = runtimePageUrl();
  const tabs = await queryTabs({});
  const existing = tabs.find((tab) => tab?.url && tab.url.startsWith(url));
  if (existing?.id) {
    await focusWindow(existing.windowId);
    await updateTab(existing.id, { active: true });
    return;
  }
  await createAppTab(url);
});
