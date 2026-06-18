const APP_PAGE = 'index.html';

function runtimePageUrl() {
  return chrome.runtime.getURL(APP_PAGE);
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
  });
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve) => {
    if (tabId == null) { resolve(null); return; }
    chrome.tabs.update(tabId, updateProperties, (tab) => resolve(tab || null));
  });
}

function focusWindow(windowId) {
  return new Promise((resolve) => {
    if (windowId == null || !chrome.windows?.update) { resolve(null); return; }
    chrome.windows.update(windowId, { focused: true }, (win) => resolve(win || null));
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
  chrome.tabs.create({ url });
});
