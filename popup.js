const enabledInput = document.querySelector("#enabled");
const status = document.querySelector("#status");
const refreshButton = document.querySelector("#refresh");
const hint = document.querySelector("#hint");

function setStatus(enabled) {
  status.textContent = enabled ? "已开启，页面右上角显示目录" : "已关闭，不显示目录";
}

async function sendToCurrentTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("没有找到当前页面");
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (firstError) {
    // 扩展刚安装/重载后，已打开的标签页可能还没有内容脚本。
    // 尝试现场注入一次，避免用户必须手动刷新普通网页。
    try {
      // 重复注入 CSS 时 Edge 可能返回错误，但这不影响脚本继续运行。
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["styles.css"] }).catch(() => {});
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await new Promise((resolve) => setTimeout(resolve, 80));
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (injectionError) {
      injectionError.cause = firstError;
      throw injectionError;
    }
  }
}

chrome.storage.local.get({ enabled: true }).then(({ enabled }) => {
  enabledInput.checked = enabled;
  setStatus(enabled);
});

enabledInput.addEventListener("change", async () => {
  const enabled = enabledInput.checked;
  await chrome.storage.local.set({ enabled });
  setStatus(enabled);
  try { await sendToCurrentTab({ type: "set-enabled", enabled }); }
  catch { hint.textContent = "此页面暂不允许注入脚本，请尝试刷新页面或检查文件 URL 权限。"; }
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  hint.textContent = "";
  try { await sendToCurrentTab({ type: "refresh" }); }
  catch { hint.textContent = "无法访问当前页面。Edge 内置页面（如设置页）不支持扩展注入。"; }
  finally { setTimeout(() => { refreshButton.disabled = false; }, 300); }
});
