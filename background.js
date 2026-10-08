const DEFAULTS = { enabled: true, collapsed: false };

async function ensureContentScript(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["styles.css"]
  }).catch(() => {});
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await ensureContentScript(tabId);
    return chrome.tabs.sendMessage(tabId, message);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULTS).then((values) => {
    chrome.storage.local.set({
      enabled: typeof values.enabled === "boolean" ? values.enabled : true,
      collapsed: typeof values.collapsed === "boolean" ? values.collapsed : false
    });
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-toc") return;
  const { enabled = true } = await chrome.storage.local.get({ enabled: true });
  const nextEnabled = !enabled;
  await chrome.storage.local.set({ enabled: nextEnabled });
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    sendToTab(tabs[0].id, { type: "set-enabled", enabled: nextEnabled }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "get-page-info") return;
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    sendResponse({ title: tab?.title || "", url: tab?.url || "" });
  });
  return true;
});
