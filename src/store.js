import { defaultDirectory } from "./default-data.js";

export function createId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

export function reorderById(items, movedId, targetId, position = "before") {
  const originalIndex = items.findIndex((item) => item.id === movedId);
  if (originalIndex < 0 || movedId === targetId) return false;
  const [movedItem] = items.splice(originalIndex, 1);
  let insertionIndex = items.findIndex((item) => item.id === targetId);
  if (insertionIndex < 0) {
    items.splice(originalIndex, 0, movedItem);
    return false;
  }
  if (position === "after") insertionIndex += 1;
  items.splice(insertionIndex, 0, movedItem);
  return items.findIndex((item) => item.id === movedId) !== originalIndex;
}

export async function getDirectory() {
  const response = await fetch("/api/directory", {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw await apiError(response, "无法读取导航数据");
  const data = await response.json();
  if (!isValidDirectory(data)) throw new Error("服务器返回的导航数据格式不正确");
  return data;
}

export async function saveDirectory(data) {
  if (!isValidDirectory(data)) throw new Error("导航数据格式不正确");
  const response = await fetch("/api/directory", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw await apiError(response, "保存导航数据失败");
  return response.json();
}

export async function resetDirectory() {
  const next = cloneData(defaultDirectory);
  await saveDirectory(next);
  return next;
}

async function apiError(response, fallbackMessage) {
  let message = fallbackMessage;
  try {
    const payload = await response.json();
    if (payload?.error) message = payload.error;
  } catch {}
  const error = new Error(message);
  error.status = response.status;
  return error;
}

export function isValidDirectory(data) {
  return Boolean(
    data &&
    Array.isArray(data.groups) &&
    data.groups.every((group) =>
      group && typeof group.id === "string" && typeof group.name === "string" && Array.isArray(group.cards) &&
      group.cards.every((card) =>
        card && typeof card.id === "string" && typeof card.title === "string" && Array.isArray(card.links) &&
        card.links.every((link) =>
          link && typeof link.id === "string" && typeof link.label === "string" && typeof link.url === "string"
        )
      )
    )
  );
}

export function countDirectory(data) {
  const groups = data.groups.length;
  const cards = data.groups.reduce((sum, group) => sum + group.cards.length, 0);
  const links = data.groups.reduce((sum, group) => sum + group.cards.reduce((inner, card) => inner + card.links.length, 0), 0);
  return { groups, cards, links };
}
