(() => {
  const ROOT_ID = "html-toc-assistant-root";
  const VIEWPORT_GAP = 24;
  const MIN_WIDTH = 280;
  const MIN_HEIGHT = 180;
  const MAX_WIDTH = 820;
  const MAX_HEIGHT = 820;

  if (window.top !== window) return;

  // A reloaded extension can leave an old isolated-world instance behind.
  // Dispose it before creating the current instance so reinjection is reliable.
  try {
    window.__htmlTocAssistantRuntime?.dispose?.();
  } catch {
    // The previous extension context may already be invalid.
  }
  document.getElementById(ROOT_ID)?.remove();

  let enabled = true;
  let panel;
  let list;
  let observer;
  let refreshTimer;
  let geometrySaveTimer;
  let gestureState;
  let disposed = false;
  let lastSignature = "";
  let toastTimer;
  const collapsedNodes = new Set();

  const isOurNode = (node) => Boolean(node?.closest?.(`#${ROOT_ID}`));

  function getLimits() {
    const viewportWidth = Math.max(240, window.innerWidth - VIEWPORT_GAP);
    const viewportHeight = Math.max(160, window.innerHeight - VIEWPORT_GAP);
    const maxWidth = Math.max(240, Math.min(MAX_WIDTH, viewportWidth));
    const maxHeight = Math.max(160, Math.min(MAX_HEIGHT, viewportHeight));
    return {
      minWidth: Math.min(MIN_WIDTH, maxWidth),
      minHeight: Math.min(MIN_HEIGHT, maxHeight),
      maxWidth,
      maxHeight
    };
  }

  function getHeadings() {
    return [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .filter((heading) => !isOurNode(heading) && heading.textContent.trim())
      .map((heading, index) => {
        if (!heading.id) {
          const base = heading.textContent.trim().toLowerCase()
            .normalize("NFKC")
            .replace(/[^\p{L}\p{N}\s-]/gu, "")
            .replace(/[\s-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || `section-${index + 1}`;
          let id = `toc-${base}`;
          let suffix = 2;
          while (document.getElementById(id)) id = `toc-${base}-${suffix++}`;
          heading.id = id;
        }
        return {
          element: heading,
          id: heading.id,
          level: Number(heading.tagName.substring(1)),
          text: heading.textContent.trim().replace(/\s+/g, " ")
        };
      });
  }

  function createPanel() {
    if (panel) return;

    panel = document.createElement("aside");
    panel.id = ROOT_ID;
    panel.setAttribute("aria-label", "页面目录");
    panel.innerHTML = `
      <div class="html-toc-header">
        <strong>页面目录</strong>
        <div class="html-toc-actions">
          <button class="html-toc-copy" type="button" data-action="copy-markdown" title="复制为 Markdown 链接目录" aria-label="复制为 Markdown 链接目录">MD</button>
          <button type="button" data-action="collapse" title="折叠目录" aria-label="折叠目录">−</button>
          <button type="button" data-action="close" title="关闭目录" aria-label="关闭目录">×</button>
        </div>
      </div>
      <div class="html-toc-body">
        <nav aria-label="标题目录"></nav>
        <p class="html-toc-empty">当前页面没有找到标题</p>
      </div>
      <div class="html-toc-footer">
        <span data-count>0 个标题</span>
        <button type="button" data-action="refresh">刷新</button>
      </div>
      <div class="html-toc-menu" role="menu" aria-label="复制 Markdown 目录" hidden>
        <button type="button" role="menuitem" data-action="copy-markdown-linked">复制为 Markdown 链接目录</button>
        <button type="button" role="menuitem" data-action="copy-markdown-headings">复制为 Markdown 标题结构</button>
        <button type="button" role="menuitem" data-action="copy-markdown-plain">复制为 Markdown 项目符号大纲</button>
      </div>
      <div class="html-toc-toast" role="status" aria-live="polite" hidden></div>
      <span class="html-toc-resizer html-toc-resizer-n" data-resize="n" aria-hidden="true"></span>
      <span class="html-toc-resizer html-toc-resizer-ne" data-resize="ne" aria-hidden="true"></span>
      <span class="html-toc-resizer html-toc-resizer-e" data-resize="e" aria-hidden="true"></span>
      <span class="html-toc-resizer html-toc-resizer-se" data-resize="se" aria-hidden="true"></span>
      <span class="html-toc-resizer html-toc-resizer-s" data-resize="s" aria-hidden="true"></span>
      <span class="html-toc-resizer html-toc-resizer-sw" data-resize="sw" aria-hidden="true"></span>
      <span class="html-toc-resizer html-toc-resizer-w" data-resize="w" aria-hidden="true"></span>
      <span class="html-toc-resizer html-toc-resizer-nw" data-resize="nw" aria-hidden="true"></span>`;

    document.documentElement.appendChild(panel);
    list = panel.querySelector("nav");
    panel.addEventListener("click", onPanelClick);
    const header = panel.querySelector(".html-toc-header");
    header.addEventListener("pointerdown", startDrag);
    header.addEventListener("contextmenu", openMarkdownMenu);
    panel.querySelectorAll("[data-resize]").forEach((handle) => {
      handle.addEventListener("pointerdown", startResize);
    });
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeyDown);
    if (window.ResizeObserver) new ResizeObserver(saveGeometry).observe(panel);
  }

  function applyGeometry(geometry = {}) {
    if (!panel) return;
    const limits = getLimits();
    let width;
    let height;
    let left;
    let top;

    if (Number.isFinite(geometry.width)) {
      width = Math.min(Math.max(limits.minWidth, geometry.width), limits.maxWidth);
      panel.style.width = `${Math.round(width)}px`;
    }
    if (Number.isFinite(geometry.height)) {
      height = Math.min(Math.max(limits.minHeight, geometry.height), limits.maxHeight);
      panel.style.height = `${Math.round(height)}px`;
    }
    if (Number.isFinite(geometry.left) && Number.isFinite(geometry.top)) {
      const currentWidth = width ?? panel.getBoundingClientRect().width;
      const currentHeight = height ?? panel.getBoundingClientRect().height;
      left = Math.min(Math.max(0, geometry.left), Math.max(0, window.innerWidth - currentWidth));
      top = Math.min(Math.max(0, geometry.top), Math.max(0, window.innerHeight - currentHeight));
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = "auto";
    }
  }

  function readGeometry() {
    const rect = panel.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    };
  }

  function saveGeometry() {
    clearTimeout(geometrySaveTimer);
    geometrySaveTimer = setTimeout(() => {
      if (panel && !panel.hidden && !panel.classList.contains("collapsed")) {
        chrome.storage.local.set({ panelGeometry: readGeometry() });
      }
    }, 120);
  }

  function startDrag(event) {
    if (event.button !== 0 || event.target.closest("button")) return;
    closeMarkdownMenu();
    const header = event.currentTarget;
    const rect = panel.getBoundingClientRect();
    gestureState = {
      type: "drag",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top
    };
    header.setPointerCapture(event.pointerId);
    header.addEventListener("pointermove", drag, { passive: false });
    header.addEventListener("pointerup", stopDrag, { once: true });
    header.addEventListener("pointercancel", stopDrag, { once: true });
    event.preventDefault();
  }

  function drag(event) {
    if (!gestureState || gestureState.type !== "drag" || event.pointerId !== gestureState.pointerId) return;
    const rect = panel.getBoundingClientRect();
    const left = Math.min(
      Math.max(0, gestureState.left + event.clientX - gestureState.startX),
      Math.max(0, window.innerWidth - rect.width)
    );
    const top = Math.min(
      Math.max(0, gestureState.top + event.clientY - gestureState.startY),
      Math.max(0, window.innerHeight - rect.height)
    );
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.right = "auto";
    event.preventDefault();
  }

  function stopDrag(event) {
    const header = event.currentTarget;
    header.removeEventListener("pointermove", drag);
    header.removeEventListener("pointerup", stopDrag);
    header.removeEventListener("pointercancel", stopDrag);
    gestureState = null;
    saveGeometry();
  }

  function startResize(event) {
    if (event.button !== 0 || panel.classList.contains("collapsed")) return;
    closeMarkdownMenu();
    const handle = event.currentTarget;
    const rect = panel.getBoundingClientRect();
    const limits = getLimits();
    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.top = `${Math.round(rect.top)}px`;
    panel.style.right = "auto";
    gestureState = {
      type: "resize",
      pointerId: event.pointerId,
      direction: handle.dataset.resize,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      ...limits
    };
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener("pointermove", resize, { passive: false });
    handle.addEventListener("pointerup", stopResize, { once: true });
    handle.addEventListener("pointercancel", stopResize, { once: true });
    event.preventDefault();
    event.stopPropagation();
  }

  function resize(event) {
    if (!gestureState || gestureState.type !== "resize" || event.pointerId !== gestureState.pointerId) return;
    const state = gestureState;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    const west = state.direction.includes("w");
    const north = state.direction.includes("n");
    let width = state.width + (west ? -dx : state.direction.includes("e") ? dx : 0);
    let height = state.height + (north ? -dy : state.direction.includes("s") ? dy : 0);
    width = Math.min(Math.max(state.minWidth, width), state.maxWidth);
    height = Math.min(Math.max(state.minHeight, height), state.maxHeight);

    let left = west ? state.left + state.width - width : state.left;
    let top = north ? state.top + state.height - height : state.top;
    left = Math.max(0, Math.min(left, Math.max(0, window.innerWidth - width)));
    top = Math.max(0, Math.min(top, Math.max(0, window.innerHeight - height)));

    panel.style.width = `${Math.round(width)}px`;
    panel.style.height = `${Math.round(height)}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    event.preventDefault();
    event.stopPropagation();
  }

  function stopResize(event) {
    const handle = event.currentTarget;
    handle.removeEventListener("pointermove", resize);
    handle.removeEventListener("pointerup", stopResize);
    handle.removeEventListener("pointercancel", stopResize);
    gestureState = null;
    saveGeometry();
  }

  function setCollapsed(value, persist = true) {
    if (!panel) return;
    const collapsed = Boolean(value);
    panel.classList.toggle("collapsed", collapsed);
    const button = panel.querySelector('[data-action="collapse"]');
    if (button) {
      button.textContent = collapsed ? "+" : "−";
      button.title = collapsed ? "展开目录" : "折叠目录";
      button.setAttribute("aria-label", button.title);
    }
    if (persist) chrome.storage.local.set({ collapsed });
  }

  function escapeMarkdownLabel(text) {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  function headingSlug(text, index, slugCounts) {
    const base = text.normalize("NFKC").toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || `section-${index + 1}`;
    const count = slugCounts.get(base) || 0;
    slugCounts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }

  function buildMarkdownOutline(mode) {
    if (mode === "headings") {
      return getHeadings()
        .map((heading) => `${"#".repeat(heading.level)} ${escapeMarkdownLabel(heading.text)}`)
        .join("\n") + "\n";
    }

    const tree = buildHeadingTree(getHeadings());
    if (!tree.length) return "";
    const lines = [];
    const slugCounts = new Map();
    let headingIndex = 0;

    function appendNodes(nodes, depth) {
      nodes.forEach((node) => {
        const indent = "  ".repeat(depth);
        if (mode === "links") {
          const label = escapeMarkdownLabel(node.text);
          const anchor = headingSlug(node.text, headingIndex++, slugCounts);
          lines.push(`${indent}- [${label}](#${anchor})`);
        } else {
          lines.push(`${indent}- ${escapeMarkdownLabel(node.text)}`);
        }
        appendNodes(node.children, depth + 1);
      });
    }

    appendNodes(tree, 0);
    return `${lines.join("\n")}\n`;
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.documentElement.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Some file:// and restricted pages only allow the legacy fallback.
      }
    }
    return fallbackCopyText(text);
  }

  function showToast(message) {
    const toast = panel?.querySelector(".html-toc-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  }

  async function copyMarkdown(mode) {
    const markdown = buildMarkdownOutline(mode);
    if (!markdown) {
      showToast("当前页面没有可复制的标题");
      return;
    }
    const copied = await copyText(markdown);
    showToast(copied
      ? ({
          links: "已复制 Markdown 链接目录",
          headings: "已复制 Markdown 标题结构",
          plain: "已复制 Markdown 项目符号大纲"
        }[mode] || "已复制 Markdown 目录")
      : "复制失败，请重试");
  }

  function closeMarkdownMenu() {
    const menu = panel?.querySelector(".html-toc-menu");
    if (menu) menu.hidden = true;
  }

  function openMarkdownMenu(event) {
    if (!panel) return;
    event.preventDefault();
    event.stopPropagation();
    if (panel.classList.contains("collapsed")) setCollapsed(false);
    const menu = panel.querySelector(".html-toc-menu");
    menu.hidden = false;
    requestAnimationFrame(() => {
      menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
    });
  }

  function onDocumentPointerDown(event) {
    if (panel && !panel.contains(event.target)) closeMarkdownMenu();
  }

  function onDocumentKeyDown(event) {
    if (event.key === "Escape") closeMarkdownMenu();
  }

  function onPanelClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    closeMarkdownMenu();
    if (action === "toggle-node") {
      const id = button.dataset.id;
      if (!id) return;
      if (collapsedNodes.has(id)) collapsedNodes.delete(id);
      else collapsedNodes.add(id);
      lastSignature = "";
      render();
    } else if (action === "collapse") {
      setCollapsed(!panel.classList.contains("collapsed"));
    } else if (action === "copy-markdown" || action === "copy-markdown-linked") {
      copyMarkdown("links");
    } else if (action === "copy-markdown-headings") {
      copyMarkdown("headings");
    } else if (action === "copy-markdown-plain") {
      copyMarkdown("plain");
    } else if (action === "close") {
      enabled = false;
      chrome.storage.local.set({ enabled: false });
      render();
    } else if (action === "refresh") {
      refresh();
    }
  }

  function buildHeadingTree(headings) {
    const root = { level: 0, children: [] };
    const stack = [root];
    headings.forEach((heading) => {
      while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop();
      const node = { ...heading, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });
    return root.children;
  }

  function createTreeNodes(nodes, container, depth = 0) {
    nodes.forEach((node) => {
      const item = document.createElement("div");
      item.className = "html-toc-node";
      item.dataset.depth = String(depth);

      const row = document.createElement("div");
      row.className = "html-toc-row";
      const collapsed = collapsedNodes.has(node.id);

      if (node.children.length) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.dataset.action = "toggle-node";
        toggle.dataset.id = node.id;
        toggle.className = "html-toc-toggle";
        toggle.textContent = collapsed ? "▸" : "▾";
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.setAttribute("aria-label", collapsed ? "展开子目录" : "折叠子目录");
        row.appendChild(toggle);
      } else {
        const spacer = document.createElement("span");
        spacer.className = "html-toc-toggle-spacer";
        spacer.setAttribute("aria-hidden", "true");
        row.appendChild(spacer);
      }

      const link = document.createElement("a");
      link.href = `#${CSS.escape(node.id)}`;
      link.dataset.target = node.id;
      link.title = node.text;
      link.textContent = node.text;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        node.element.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", `#${encodeURIComponent(node.id)}`);
      });
      row.appendChild(link);
      item.appendChild(row);

      if (node.children.length) {
        const children = document.createElement("div");
        children.className = "html-toc-children";
        children.hidden = collapsed;
        createTreeNodes(node.children, children, depth + 1);
        item.appendChild(children);
      }
      container.appendChild(item);
    });
  }

  function render() {
    createPanel();
    panel.hidden = !enabled;
    if (!enabled) return;

    const headings = getHeadings();
    const signature = headings.map((item) => `${item.level}:${item.id}:${item.text}`).join("|");
    if (signature === lastSignature && list.childElementCount) return;

    lastSignature = signature;
    list.replaceChildren();
    panel.querySelector(".html-toc-empty").hidden = headings.length > 0;
    panel.querySelector("[data-count]").textContent = `${headings.length} 个标题`;
    createTreeNodes(buildHeadingTree(headings), list);
  }

  function refresh() {
    lastSignature = "";
    render();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 250);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) render();
    else if (panel) panel.hidden = true;
  }

  function onMessage(message) {
    if (message.type === "set-enabled") setEnabled(message.enabled);
    if (message.type === "refresh") refresh();
  }

  function onStorageChanged(changes, areaName) {
    if (areaName !== "local") return;
    if (changes.enabled) setEnabled(changes.enabled.newValue);
    if (changes.collapsed && panel) setCollapsed(changes.collapsed.newValue, false);
  }

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorageChanged);

  // Expose a cleanup handle so extension reloads can retire an old instance.
  window.__htmlTocAssistantRuntime = {
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(refreshTimer);
      clearTimeout(geometrySaveTimer);
      clearTimeout(toastTimer);
      observer?.disconnect();
      try {
        chrome.runtime.onMessage.removeListener(onMessage);
        chrome.storage.onChanged.removeListener(onStorageChanged);
      } catch {
        // The old extension context can already be invalid after a reload.
      }
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      document.removeEventListener("keydown", onDocumentKeyDown);
      panel?.remove();
      panel = null;
      list = null;
    }
  };

  chrome.storage.local.get({ enabled: true, collapsed: false, panelGeometry: {} })
    .then((values) => {
      if (disposed) return;
      enabled = values.enabled;
      createPanel();
      setCollapsed(values.collapsed, false);
      applyGeometry(values.panelGeometry);
      render();

      observer = new MutationObserver((mutations) => {
        const touchesPage = mutations.some((mutation) => {
          if (isOurNode(mutation.target)) return false;
          if (mutation.type === "characterData") return true;
          return [...mutation.addedNodes, ...mutation.removedNodes]
            .some((node) => !isOurNode(node));
        });
        if (touchesPage) scheduleRefresh();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    })
    .catch(() => {
      if (!disposed) render();
    });
})();
