import {
  getCategories, addBookmark, searchBookmarks, getCategoryStats
} from '../shared/bookmark-manager.js';
import { login, logout, isLoggedIn, getUser } from '../shared/auth.js';
import { onUnauthorized } from '../shared/api.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentTab = null;
let listenersReady = false;

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', async () => {
  setupAuthListeners();
  onUnauthorized(showAuth);

  if (await isLoggedIn()) {
    await showApp();
  } else {
    showAuth();
  }
});

// ==================== AUTH ====================

function setupAuthListeners() {
  $('#btnLogin').addEventListener('click', handleLogin);
  $('#authPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  $('#btnLogout').addEventListener('click', handleLogout);
  $('#linkRegister').addEventListener('click', openSidePanel);
  // Nút mở Side Panel luôn hoạt động, kể cả khi chưa đăng nhập.
  $('#btnOpenPanel').addEventListener('click', openSidePanel);
}

async function openSidePanel(e) {
  if (e) e.preventDefault();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
}

function showAuth() {
  $('#authSection').classList.remove('hidden');
  $('#mainContent').classList.add('hidden');
  $('#btnLogout').classList.add('hidden');
}

async function showApp() {
  $('#authSection').classList.add('hidden');
  $('#mainContent').classList.remove('hidden');
  $('#btnLogout').classList.remove('hidden');

  const user = await getUser();
  $('#accountEmail').textContent = user?.email || '';

  await loadCurrentTab();
  await loadCategories();
  checkPendingBookmark();

  if (!listenersReady) {
    setupEventListeners();
    listenersReady = true;
  }
}

async function handleLogin() {
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  hideAuthError();

  if (!email || !password) {
    showAuthError('Vui lòng nhập email và mật khẩu.');
    return;
  }

  const btn = $('#btnLogin');
  btn.disabled = true;
  btn.textContent = 'Đang đăng nhập...';

  try {
    await login({ email, password });
    $('#authPassword').value = '';
    await showApp();
  } catch (err) {
    showAuthError(err.message || 'Đăng nhập thất bại.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Đăng nhập';
  }
}

async function handleLogout() {
  await logout();
  showAuth();
}

function showAuthError(message) {
  const el = $('#authError');
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideAuthError() {
  $('#authError').classList.add('hidden');
}

// ==================== CURRENT TAB ====================

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
  const container = $('#categoryList');
  let stats;
  try {
    stats = await getCategoryStats();
  } catch (err) {
    showToast(err.message || 'Không tải được danh mục');
    return;
  }
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

  // (Nút "Open Side Panel" đã gắn listener trong setupAuthListeners)

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
  let categories;
  try {
    categories = await getCategories();
  } catch (err) {
    showToast(err.message || 'Không tải được danh mục');
    return;
  }
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

  try {
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
    await chrome.storage.local.remove('pendingBookmark');
  } catch (err) {
    showToast(err.message || 'Không lưu được bookmark');
  }
}

// ==================== SEARCH ====================

async function performSearch(query) {
  const container = $('#searchResults');
  const catList = $('#categoryList');

  let results;
  try {
    results = await searchBookmarks(query);
  } catch (err) {
    showToast(err.message || 'Tìm kiếm thất bại');
    return;
  }

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
