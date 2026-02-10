import {
  getCategories, addBookmark, searchBookmarks, getCategoryStats
} from '../shared/bookmark-manager.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentTab = null;

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentTab();
  await loadCategories();
  checkPendingBookmark();
  setupEventListeners();
});

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  if (tab) {
    try {
      const domain = new URL(tab.url).hostname;
      $('#pageFavicon').src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      $('#pageFavicon').src = '../assets/icons/icon32.png';
    }
    $('#pageTitle').textContent = tab.title || 'Untitled';
    $('#pageUrl').textContent = tab.url;
  }
}

async function loadCategories() {
  const stats = await getCategoryStats();
  const container = $('#categoryList');
  container.innerHTML = '';

  if (stats.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-folder-open"></i>No categories yet</div>';
    return;
  }

  stats.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'category-item';
    el.innerHTML = `
      <div class="cat-icon"><i class="${cat.icon}"></i></div>
      <span class="cat-name">${escapeHtml(cat.name)}</span>
      <span class="cat-count">${cat.count}</span>
    `;
    el.addEventListener('click', () => openSidePanelWithCategory(cat.id));
    container.appendChild(el);
  });
}

// ==================== QUICK ADD ====================

function setupEventListeners() {
  // Quick add
  $('#btnQuickAdd').addEventListener('click', openQuickAddModal);
  $('#btnCancelAdd').addEventListener('click', closeQuickAddModal);
  $('#btnConfirmAdd').addEventListener('click', confirmQuickAdd);

  // Open side panel
  $('#btnOpenPanel').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.sidePanel.open({ windowId: tab.windowId });
    }
    window.close();
  });

  // Search
  let searchTimeout;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length === 0) {
      $('#searchResults').classList.add('hidden');
      $('#categoryList').classList.remove('hidden');
      return;
    }
    searchTimeout = setTimeout(() => performSearch(query), 300);
  });

  // Close modal on overlay click
  $('#quickAddModal').addEventListener('click', (e) => {
    if (e.target === $('#quickAddModal')) closeQuickAddModal();
  });
}

async function openQuickAddModal() {
  if (!currentTab) return;

  $('#addTitle').value = currentTab.title || '';
  $('#addUrl').value = currentTab.url || '';

  // Populate category select
  const categories = await getCategories();
  const select = $('#addCategory');
  select.innerHTML = '';
  categories.sort((a, b) => a.order - b.order).forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.isDefault) opt.selected = true;
    select.appendChild(opt);
  });

  $('#quickAddModal').classList.remove('hidden');
  $('#addTitle').focus();
}

function closeQuickAddModal() {
  $('#quickAddModal').classList.add('hidden');
}

async function confirmQuickAdd() {
  const title = $('#addTitle').value.trim();
  const url = $('#addUrl').value.trim();
  const categoryId = $('#addCategory').value;

  if (!url) return;

  const result = await addBookmark(title, url, categoryId);

  if (result.duplicate) {
    showToast('Bookmark already exists in this category');
  } else {
    showToast('Bookmark added successfully!');
    const btn = $('#btnQuickAdd');
    btn.classList.add('saved');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
  }

  closeQuickAddModal();
  await loadCategories();

  // Clear pending bookmark
  await chrome.storage.local.remove('pendingBookmark');
}

// ==================== SEARCH ====================

async function performSearch(query) {
  const results = await searchBookmarks(query);
  const container = $('#searchResults');
  const catList = $('#categoryList');

  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state">No results found</div>';
    container.classList.remove('hidden');
    catList.classList.add('hidden');
    return;
  }

  container.innerHTML = '';
  results.slice(0, 20).forEach(bm => {
    const el = document.createElement('div');
    el.className = 'search-result-item';
    el.innerHTML = `
      <img src="${escapeHtml(bm.favicon)}" alt="" onerror="this.src='../assets/icons/icon16.png'">
      <span class="result-title">${escapeHtml(bm.title)}</span>
      <span class="result-url">${escapeHtml(new URL(bm.url).hostname)}</span>
    `;
    el.addEventListener('click', () => {
      chrome.tabs.create({ url: bm.url });
      window.close();
    });
    container.appendChild(el);
  });

  container.classList.remove('hidden');
  catList.classList.add('hidden');
}

// ==================== CONTEXT MENU PENDING ====================

async function checkPendingBookmark() {
  const result = await chrome.storage.local.get('pendingBookmark');
  if (result.pendingBookmark?.fromContextMenu) {
    const { title, url } = result.pendingBookmark;
    currentTab = { title, url };
    await loadCurrentTab();
    openQuickAddModal();
    await chrome.storage.local.remove('pendingBookmark');
  }
}

// ==================== SIDE PANEL ====================

async function openSidePanelWithCategory(categoryId) {
  await chrome.storage.local.set({ activeCategoryId: categoryId });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
  window.close();
}

// ==================== UTILS ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
