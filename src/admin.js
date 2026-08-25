import { countDirectory, createId, getDirectory, isValidDirectory, reorderById, saveDirectory } from "./store.js";

const elements = {
  groupList: document.querySelector("#admin-group-list"),
  groupCount: document.querySelector("#group-count"),
  groupHeader: document.querySelector("#selected-group-header"),
  cardList: document.querySelector("#admin-card-list"),
  stats: document.querySelector("#admin-stats"),
  dialog: document.querySelector("#editor-dialog"),
  form: document.querySelector("#editor-form"),
  fields: document.querySelector("#dialog-fields"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogEyebrow: document.querySelector("#dialog-eyebrow"),
  importFile: document.querySelector("#import-file"),
  toast: document.querySelector("#toast")
};

const authResponse = await fetch("/api/auth/status", { headers: { Accept: "application/json" }, cache: "no-store" });
const authStatus = authResponse.ok ? await authResponse.json() : { authenticated: false };
if (!authStatus.authenticated) {
  location.replace("/login.html?next=%2Fadmin.html");
  throw new Error("Authentication required");
}

let directory = await getDirectory();
let selectedGroupId = directory.groups[0]?.id ?? null;
let editorState = null;
let saveQueue = Promise.resolve();
let dragState = null;

const gripIcon = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>`;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function selectedGroup() {
  return directory.groups.find((group) => group.id === selectedGroupId);
}

function safeUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

function persist(message = "更改已保存") {
  const snapshot = JSON.parse(JSON.stringify(directory));
  render();
  showToast("正在保存…");
  saveQueue = saveQueue.catch(() => {}).then(() => saveDirectory(snapshot)).then(() => {
    showToast(message);
  }).catch((error) => {
    if (error.status === 401) {
      location.replace("/login.html?next=%2Fadmin.html");
      return;
    }
    showToast(`保存失败：${error.message}`);
  });
}

function renderStats() {
  const counts = countDirectory(directory);
  elements.stats.innerHTML = [
    [counts.groups, "分组"], [counts.cards, "卡片"], [counts.links, "链接"]
  ].map(([value, label]) => `<div><dt>${value}</dt><dd>${label}</dd></div>`).join("");
}

function renderGroupList() {
  elements.groupCount.textContent = `${directory.groups.length} 个`;
  if (!directory.groups.length) {
    elements.groupList.innerHTML = `<div class="panel-empty"><b>还没有分组</b><span>从右上角 + 开始创建</span></div>`;
    return;
  }
  elements.groupList.innerHTML = directory.groups.map((group, index) => `
    <div class="admin-group-row${group.id === selectedGroupId ? " is-selected" : ""}" data-reorder-item="group" data-reorder-id="${escapeHtml(group.id)}">
      <button class="reorder-handle" type="button" draggable="true" data-reorder-handle="group" data-reorder-id="${escapeHtml(group.id)}" aria-label="调整分组“${escapeHtml(group.name)}”的顺序，可拖拽或使用方向键" title="拖拽排序；也可使用方向键">
        ${gripIcon}
      </button>
      <button class="admin-group-item${group.id === selectedGroupId ? " is-selected" : ""}" type="button" data-group-id="${escapeHtml(group.id)}">
        <span class="group-order">${String(index + 1).padStart(2, "0")}</span>
        <span><b>${escapeHtml(group.name)}</b><small>${group.cards.length} 张卡片</small></span>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>
      </button>
    </div>
  `).join("");
}

function renderGroupHeader() {
  const group = selectedGroup();
  if (!group) {
    elements.groupHeader.innerHTML = `<div><p class="eyebrow">GET STARTED</p><h2>创建第一个导航分组</h2><p>分组用于组织一类相关的系统或资源。</p></div><button class="primary-button" type="button" data-action="add-group">新增分组</button>`;
    elements.cardList.innerHTML = "";
    return;
  }
  elements.groupHeader.innerHTML = `
    <div>
      <p class="eyebrow">${escapeHtml(group.eyebrow || "DIRECTORY GROUP")}</p>
      <h2>${escapeHtml(group.name)}</h2>
      <p>${escapeHtml(group.description || "暂无分组说明")}</p>
    </div>
    <div class="selected-group-actions">
      <button class="secondary-button" type="button" data-action="edit-group">编辑分组</button>
      <button class="secondary-button danger-button" type="button" data-action="delete-group">删除</button>
      <button class="primary-button" type="button" data-action="add-card">新增卡片</button>
    </div>
  `;
}

function renderCards() {
  const group = selectedGroup();
  if (!group) return;
  if (!group.cards.length) {
    elements.cardList.innerHTML = `<div class="content-empty"><span>01</span><h3>这个分组还是空的</h3><p>添加卡片，然后为卡片配置一个或多个链接。</p><button class="primary-button" type="button" data-action="add-card">新增卡片</button></div>`;
    return;
  }
  elements.cardList.innerHTML = group.cards.map((card, cardIndex) => `
    <article class="admin-card" data-card-id="${escapeHtml(card.id)}" data-reorder-item="card" data-reorder-id="${escapeHtml(card.id)}">
      <header class="admin-card-header">
        <button class="reorder-handle card-reorder-handle" type="button" draggable="true" data-reorder-handle="card" data-reorder-id="${escapeHtml(card.id)}" aria-label="调整卡片“${escapeHtml(card.title)}”的顺序，可拖拽或使用上下方向键" title="拖拽排序；也可使用上下方向键">
          ${gripIcon}
        </button>
        <div class="admin-card-index">${String(cardIndex + 1).padStart(2, "0")}</div>
        <div class="admin-card-title"><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.description || "暂无卡片说明")}</p></div>
        <span class="link-count-badge">${card.links.length} 个链接</span>
        <div class="row-actions">
          <button class="small-action" type="button" data-action="edit-card" data-card-id="${escapeHtml(card.id)}">编辑</button>
          <button class="small-action danger" type="button" data-action="delete-card" data-card-id="${escapeHtml(card.id)}">删除</button>
        </div>
      </header>
      <div class="admin-links">
        ${card.links.map((link) => `
          <div class="admin-link-row">
            <span class="link-status" aria-hidden="true"></span>
            <div class="admin-link-copy"><b>${escapeHtml(link.label)}</b><span>${escapeHtml(link.url)}</span></div>
            <a href="${escapeHtml(safeUrl(link.url))}" target="_blank" rel="noreferrer" aria-label="测试 ${escapeHtml(link.label)}">测试</a>
            <button type="button" data-action="edit-link" data-card-id="${escapeHtml(card.id)}" data-link-id="${escapeHtml(link.id)}">编辑</button>
            <button class="danger" type="button" data-action="delete-link" data-card-id="${escapeHtml(card.id)}" data-link-id="${escapeHtml(link.id)}">删除</button>
          </div>
        `).join("")}
        <button class="add-link-row" type="button" data-action="add-link" data-card-id="${escapeHtml(card.id)}"><span>+</span> 为此卡片添加链接</button>
      </div>
    </article>
  `).join("");
}

function render() {
  if (selectedGroupId && !directory.groups.some((group) => group.id === selectedGroupId)) selectedGroupId = directory.groups[0]?.id ?? null;
  renderStats();
  renderGroupList();
  renderGroupHeader();
  renderCards();
}

function clearDropIndicators(container) {
  container.querySelectorAll(".is-drop-before, .is-drop-after, .is-dragging").forEach((item) => {
    item.classList.remove("is-drop-before", "is-drop-after", "is-dragging");
  });
}

function reorderItems(type) {
  return type === "group" ? directory.groups : selectedGroup()?.cards ?? [];
}

function focusReorderHandle(container, type, id) {
  requestAnimationFrame(() => {
    [...container.querySelectorAll(`[data-reorder-handle="${type}"]`)].find((handle) => handle.dataset.reorderId === id)?.focus();
  });
}

function setupReorderContainer(container, type) {
  container.addEventListener("dragstart", (event) => {
    const handle = event.target.closest(`[data-reorder-handle="${type}"]`);
    if (!handle || !container.contains(handle)) return;
    const item = handle.closest(`[data-reorder-item="${type}"]`);
    dragState = { type, id: handle.dataset.reorderId };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${type}:${dragState.id}`);
    if (item && event.dataTransfer.setDragImage) event.dataTransfer.setDragImage(item, 18, 18);
    requestAnimationFrame(() => item?.classList.add("is-dragging"));
  });

  container.addEventListener("dragover", (event) => {
    if (!dragState || dragState.type !== type) return;
    const target = event.target.closest(`[data-reorder-item="${type}"]`);
    if (!target || target.dataset.reorderId === dragState.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    container.querySelectorAll(".is-drop-before, .is-drop-after").forEach((item) => item.classList.remove("is-drop-before", "is-drop-after"));
    const bounds = target.getBoundingClientRect();
    const horizontal = type === "group" && window.matchMedia("(max-width: 760px)").matches;
    const position = horizontal
      ? (event.clientX < bounds.left + bounds.width / 2 ? "before" : "after")
      : (event.clientY < bounds.top + bounds.height / 2 ? "before" : "after");
    target.classList.add(position === "before" ? "is-drop-before" : "is-drop-after");
  });

  container.addEventListener("drop", (event) => {
    if (!dragState || dragState.type !== type) return;
    const target = event.target.closest(`[data-reorder-item="${type}"]`);
    if (!target) return;
    event.preventDefault();
    const position = target.classList.contains("is-drop-after") ? "after" : "before";
    const movedId = dragState.id;
    const changed = reorderById(reorderItems(type), movedId, target.dataset.reorderId, position);
    dragState = null;
    clearDropIndicators(container);
    if (changed) persist(type === "group" ? "分组顺序已保存" : "卡片顺序已保存");
  });

  container.addEventListener("dragend", () => {
    dragState = null;
    clearDropIndicators(container);
  });

  container.addEventListener("keydown", (event) => {
    const handle = event.target.closest(`[data-reorder-handle="${type}"]`);
    if (!handle) return;
    const direction = ["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : 0);
    if (!direction) return;
    event.preventDefault();
    const items = reorderItems(type);
    const currentIndex = items.findIndex((item) => item.id === handle.dataset.reorderId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    [items[currentIndex], items[nextIndex]] = [items[nextIndex], items[currentIndex]];
    const movedId = handle.dataset.reorderId;
    persist(type === "group" ? "分组顺序已保存" : "卡片顺序已保存");
    focusReorderHandle(container, type, movedId);
  });
}

const fieldTemplates = {
  group: (value = {}) => `
    <label><span>分组名称</span><input name="name" required maxlength="30" value="${escapeHtml(value.name || "")}" placeholder="例如：研发环境" /></label>
    <label><span>英文标识</span><input name="eyebrow" maxlength="30" value="${escapeHtml(value.eyebrow || "")}" placeholder="例如：ENGINEERING" /></label>
    <label><span>分组说明</span><textarea name="description" maxlength="100" rows="3" placeholder="说明这里收录什么内容">${escapeHtml(value.description || "")}</textarea></label>`,
  card: (value = {}) => `
    <label><span>卡片名称</span><input name="title" required maxlength="40" value="${escapeHtml(value.title || "")}" placeholder="例如：研发 Dashboard" /></label>
    <label><span>卡片说明</span><textarea name="description" maxlength="100" rows="3" placeholder="帮助用户快速理解用途">${escapeHtml(value.description || "")}</textarea></label>`,
  link: (value = {}) => `
    <label><span>链接名称</span><input name="label" required maxlength="30" value="${escapeHtml(value.label || "")}" placeholder="例如：查看面板" /></label>
    <label><span>链接地址</span><input name="url" type="url" required value="${escapeHtml(value.url || "")}" placeholder="https://example.com" /></label>`
};

function openEditor(type, mode, context = {}) {
  editorState = { type, mode, ...context };
  let value = {};
  if (type === "group" && mode === "edit") value = selectedGroup();
  if (type === "card" && mode === "edit") value = selectedGroup().cards.find((card) => card.id === context.cardId);
  if (type === "link" && mode === "edit") value = selectedGroup().cards.find((card) => card.id === context.cardId).links.find((link) => link.id === context.linkId);
  const labels = { group: "分组", card: "卡片", link: "链接" };
  elements.dialogEyebrow.textContent = mode === "add" ? "CREATE CONTENT" : "EDIT CONTENT";
  elements.dialogTitle.textContent = `${mode === "add" ? "新增" : "编辑"}${labels[type]}`;
  elements.fields.innerHTML = fieldTemplates[type](value);
  elements.dialog.showModal();
  requestAnimationFrame(() => elements.fields.querySelector("input")?.focus());
}

function applyEditor() {
  if (!elements.form.reportValidity()) return false;
  const values = Object.fromEntries(new FormData(elements.form));
  const group = selectedGroup();
  if (editorState.type === "group") {
    if (editorState.mode === "add") {
      const next = { id: createId("group"), name: values.name.trim(), eyebrow: values.eyebrow.trim().toUpperCase(), description: values.description.trim(), cards: [] };
      directory.groups.push(next);
      selectedGroupId = next.id;
    } else Object.assign(group, { name: values.name.trim(), eyebrow: values.eyebrow.trim().toUpperCase(), description: values.description.trim() });
  }
  if (editorState.type === "card") {
    if (editorState.mode === "add") group.cards.push({ id: createId("card"), title: values.title.trim(), description: values.description.trim(), links: [] });
    else Object.assign(group.cards.find((card) => card.id === editorState.cardId), { title: values.title.trim(), description: values.description.trim() });
  }
  if (editorState.type === "link") {
    const card = group.cards.find((item) => item.id === editorState.cardId);
    if (editorState.mode === "add") card.links.push({ id: createId("link"), label: values.label.trim(), url: values.url.trim() });
    else Object.assign(card.links.find((link) => link.id === editorState.linkId), { label: values.label.trim(), url: values.url.trim() });
  }
  persist();
  return true;
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (applyEditor()) elements.dialog.close();
});

elements.dialog.querySelectorAll("[data-dialog-close]").forEach((button) => {
  button.addEventListener("click", () => elements.dialog.close("cancel"));
});

elements.dialog.addEventListener("close", () => {
  editorState = null;
});

elements.groupList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-group-id]");
  if (!button) return;
  selectedGroupId = button.dataset.groupId;
  render();
});

function handleAction(event) {
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const { action, cardId, linkId } = actionElement.dataset;
  const group = selectedGroup();
  if (action === "add-group") openEditor("group", "add");
  if (action === "edit-group") openEditor("group", "edit");
  if (action === "delete-group" && confirm(`确定删除“${group.name}”及其全部卡片和链接吗？`)) {
    directory.groups = directory.groups.filter((item) => item.id !== group.id);
    selectedGroupId = directory.groups[0]?.id ?? null;
    persist("分组已删除");
  }
  if (action === "add-card") openEditor("card", "add");
  if (action === "edit-card") openEditor("card", "edit", { cardId });
  if (action === "add-link") openEditor("link", "add", { cardId });
  if (action === "edit-link") openEditor("link", "edit", { cardId, linkId });
  if (action === "delete-card" && confirm("确定删除这张卡片及其全部链接吗？")) {
    group.cards = group.cards.filter((card) => card.id !== cardId);
    persist("卡片已删除");
  }
  if (action === "delete-link" && confirm("确定删除这个链接吗？")) {
    const card = group.cards.find((item) => item.id === cardId);
    card.links = card.links.filter((link) => link.id !== linkId);
    persist("链接已删除");
  }
}

elements.groupHeader.addEventListener("click", handleAction);
elements.cardList.addEventListener("click", handleAction);
setupReorderContainer(elements.groupList, "group");
setupReorderContainer(elements.cardList, "card");
document.querySelector("#add-group-button").addEventListener("click", () => openEditor("group", "add"));

document.querySelector("#export-button").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(directory, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `info-directory-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("配置已导出");
});

document.querySelector("#import-button").addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", async () => {
  const file = elements.importFile.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!isValidDirectory(imported)) throw new Error("格式不正确");
    directory = imported;
    selectedGroupId = directory.groups[0]?.id ?? null;
    persist("配置已导入");
  } catch (error) {
    showToast(`导入失败：${error.message}`);
  } finally {
    elements.importFile.value = "";
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await saveQueue.catch(() => {});
    await fetch("/api/auth/logout", { method: "POST", headers: { Accept: "application/json" } });
  } finally {
    location.replace("/login.html");
  }
});

render();
