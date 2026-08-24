import { countDirectory, getDirectory } from "./store.js";

const directoryElement = document.querySelector("#directory");
const groupNav = document.querySelector("#group-nav");
const searchInput = document.querySelector("#search-input");
const clearSearch = document.querySelector("#clear-search");
const emptyState = document.querySelector("#empty-state");
const summary = document.querySelector("#entry-summary");

let directory;
try {
  directory = await getDirectory();
} catch (error) {
  console.error(error);
  directory = { version: 1, groups: [] };
}

function escapeHtml(value = "") {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function initials(title) {
  const asciiWords = title.match(/[A-Za-z0-9]+/g);
  if (asciiWords?.length) return asciiWords.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return [...title].slice(0, 2).join("");
}

function safeUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}

function renderNavigation(groups) {
  groupNav.innerHTML = groups.map((group, index) => `
    <a class="track-item${index === 0 ? " is-active" : ""}" href="#group-${escapeHtml(group.id)}" title="${escapeHtml(group.name)}">
      <span class="track-node">${String(index + 1).padStart(2, "0")}</span>
      <span class="track-label">
        <b>${escapeHtml(group.name)}</b>
        <small>${escapeHtml(group.eyebrow || "DIRECTORY")}</small>
      </span>
      <span class="track-count">${group.cards.length}</span>
    </a>
  `).join("");
}

function cardTemplate(card) {
  const primary = card.links[0];
  const secondary = card.links.slice(1);
  return `
    <article class="directory-card">
      <div class="card-topline">
        <span class="card-monogram" aria-hidden="true">${escapeHtml(initials(card.title))}</span>
        <div class="card-copy">
          <h3>${escapeHtml(card.title)}</h3>
          <p>${escapeHtml(card.description || "团队常用入口")}</p>
        </div>
        <span class="link-total">${card.links.length} 个入口</span>
      </div>
      <div class="card-links">
        ${primary ? `<a class="card-primary-link" href="${safeUrl(primary.url)}" target="_blank" rel="noreferrer"><span>${escapeHtml(primary.label)}</span><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></a>` : `<span class="no-link">尚未配置链接</span>`}
        ${secondary.length ? `<div class="secondary-links">${secondary.map((link) => `<a href="${safeUrl(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`).join("")}</div>` : ""}
      </div>
    </article>
  `;
}

function render(query = "") {
  const counts = countDirectory(directory);
  summary.textContent = `已收录 ${counts.links} 个入口 · 持续维护中`;
  const normalized = query.trim().toLocaleLowerCase();
  const groups = directory.groups.map((group) => ({
    ...group,
    cards: group.cards.filter((card) => [group.name, group.description, card.title, card.description, ...card.links.flatMap((link) => [link.label, link.url])]
      .join(" ").toLocaleLowerCase().includes(normalized))
  })).filter((group) => group.cards.length > 0);

  directoryElement.innerHTML = groups.map((group, groupIndex) => `
    <section id="group-${escapeHtml(group.id)}" class="directory-group" style="--group-index:${groupIndex}">
      <div class="group-heading">
        <div class="group-number">${String(directory.groups.findIndex((item) => item.id === group.id) + 1).padStart(2, "0")}</div>
        <div>
          <p class="eyebrow">${escapeHtml(group.eyebrow || "DIRECTORY GROUP")}</p>
          <h2>${escapeHtml(group.name)}</h2>
          <p>${escapeHtml(group.description || "")}</p>
        </div>
        <span class="group-count">${group.cards.length} 张卡片</span>
      </div>
      <div class="card-grid">${group.cards.map(cardTemplate).join("")}</div>
    </section>
  `).join("");

  emptyState.hidden = groups.length > 0;
  directoryElement.hidden = groups.length === 0;
  clearSearch.hidden = !normalized;
  renderNavigation(normalized ? groups : directory.groups);
  observeGroups();
}

function setActiveGroup(sectionId) {
  document.querySelectorAll(".track-item").forEach((item) => {
    const isActive = item.hash === `#${sectionId}`;
    item.classList.toggle("is-active", isActive);
    if (isActive) item.setAttribute("aria-current", "location");
    else item.removeAttribute("aria-current");
  });
}

let scrollFrame = 0;
function syncActiveGroup() {
  scrollFrame = 0;
  const sections = [...document.querySelectorAll(".directory-group")];
  if (!sections.length) return;

  const readingLine = window.innerHeight * 0.5;
  const activeSection = sections.find((section) => {
    const rect = section.getBoundingClientRect();
    return rect.top <= readingLine && rect.bottom > readingLine;
  }) ?? sections.reduce((closest, section) => {
    const distance = Math.abs(section.getBoundingClientRect().top - readingLine);
    return distance < closest.distance ? { section, distance } : closest;
  }, { section: sections[0], distance: Number.POSITIVE_INFINITY }).section;

  setActiveGroup(activeSection.id);
}

function observeGroups() {
  requestAnimationFrame(syncActiveGroup);
}

function scheduleGroupSync() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(syncActiveGroup);
}

function clearSearchValue() {
  searchInput.value = "";
  render();
  searchInput.focus();
}

searchInput.addEventListener("input", (event) => render(event.target.value));
groupNav.addEventListener("click", (event) => {
  const item = event.target.closest(".track-item");
  if (item) setActiveGroup(item.hash.slice(1));
});
clearSearch.addEventListener("click", clearSearchValue);
document.querySelector("[data-clear-search]").addEventListener("click", clearSearchValue);
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape" && document.activeElement === searchInput) clearSearchValue();
});

window.addEventListener("scroll", scheduleGroupSync, { passive: true });
window.addEventListener("resize", scheduleGroupSync);
render();
