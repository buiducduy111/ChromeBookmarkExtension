import {
  getCategories, addCategory, updateCategory, deleteCategory,
  reorderCategories, getBookmarksByCategory, addBookmark,
  updateBookmark, deleteBookmark, searchBookmarks, importChromeBookmarks,
  getCategoryStats
} from '../shared/bookmark-manager.js';
import { ICON_LIST } from '../shared/icon-list.js';
import { register, login, logout, isLoggedIn, getUser } from '../shared/auth.js';
import { onUnauthorized } from '../shared/api.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let activeCategoryId = null;
let confirmCallback = null;
let appListenersReady = false;

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', async () => {
  setupAuthListeners();
  onUnauthorized(showAuth);
  renderIconPicker();

  if (await isLoggedIn()) {
    await showApp();
  } else {
    showAuth();
  }
});

// ==================== AUTH ====================

function setupAuthListeners() {
  $('#tabLogin').addEventListener('click', () => switchAuthTab('login'));
  $('#tabRegister').addEventListener('click', () => switchAuthTab('register'));
  $('#btnLoginSubmit').addEventListener('click', handleLogin);
  $('#btnRegisterSubmit').addEventListener('click', handleRegister);
  $('#loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
  $('#regPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRegister(); });
  $('#btnLogout').addEventListener('click', handleLogout);
}

function switchAuthTab(tab) {
  hideAuthError();
  const isLogin = tab === 'login';
  $('#tabLogin').classList.toggle('active', isLogin);
  $('#tabRegister').classList.toggle('active', !isLogin);
  $('#loginForm').classList.toggle('hidden', !isLogin);
  $('#registerForm').classList.toggle('hidden', isLogin);
}

function showAuth() {
  $('#authScreen').classList.remove('hidden');
  $('#appBody').classList.add('hidden');
  $('#headerActions').classList.add('hidden');
}

async function showApp() {
  $('#authScreen').classList.add('hidden');
  $('#appBody').classList.remove('hidden');
  $('#headerActions').classList.remove('hidden');

  const user = await getUser();
  $('#accountEmail').textContent = user?.email || '';

  if (!appListenersReady) {
    setupEventListeners();
    appListenersReady = true;
  }

  await loadCategories();
  checkActiveCategory();
}

async function handleLogin() {
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  hideAuthError();
  if (!email || !password) {
    showAuthError('Vui lòng nhập email và mật khẩu.');
    return;
  }
  await submitAuth($('#btnLoginSubmit'), 'Đăng nhập', () => login({ email, password }));
}

async function handleRegister() {
  const name = $('#regName').value.trim();
  const email = $('#regEmail').value.trim();
  const password = $('#regPassword').value;
  hideAuthError();
  if (!email || !password) {
    showAuthError('Vui lòng nhập email và mật khẩu.');
    return;
  }
  if (password.length < 8) {
    showAuthError('Mật khẩu tối thiểu 8 ký tự.');
    return;
  }
  await submitAuth($('#btnRegisterSubmit'), 'Tạo tài khoản', () => register({ name, email, password }));
}

async function submitAuth(btn, label, action) {
  btn.disabled = true;
  btn.textContent = 'Đang xử lý...';
  try {
    await action();
    // Xóa mật khẩu khỏi form sau khi thành công.
    $('#loginPassword').value = '';
    $('#regPassword').value = '';
    await showApp();
  } catch (err) {
    showAuthError(extractAuthError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// Lấy thông báo lỗi (ưu tiên message validation đầu tiên của Laravel).
function extractAuthError(err) {
  const data = err?.data;
  if (data?.errors) {
    const first = Object.values(data.errors)[0];
    if (Array.isArray(first) && first.length) return first[0];
  }
  return err?.message || 'Đã có lỗi xảy ra.';
}

async function handleLogout() {
  await logout();
  activeCategoryId = null;
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

// ==================== CATEGORIES ====================

async function loadCategories() {
  let stats;
  try {
    stats = await getCategoryStats();
  } catch (err) {
    showToast(err.message || 'Không tải được danh mục');
    return;
  }
  const container = $('#categoryList');
  container.innerHTML = '';

  stats.forEach(cat => {
    const el = document.createElement('div');
    el.className = `cat-item${cat.id === activeCategoryId ? ' active' : ''}`;
    el.dataset.id = cat.id;
    el.dataset.default = cat.isDefault;
    el.draggable = true;
    el.innerHTML = `
      <span class="cat-icon"><i class="${cat.icon}"></i></span>
      <span class="cat-label">${escapeHtml(cat.name)}</span>
      <span class="cat-count">${cat.count}</span>
    `;
    el.addEventListener('click', () => selectCategory(cat.id));
    setupDragDrop(el);
    container.appendChild(el);
  });
}

async function selectCategory(categoryId) {
  activeCategoryId = categoryId;

  // Update active state in sidebar
  $$('.cat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === categoryId);
  });

  await loadBookmarks(categoryId);

  // Show main header
  let categories;
  try {
    categories = await getCategories();
  } catch (err) {
    showToast(err.message || 'Lỗi tải danh mục');
    return;
  }
  const cat = categories.find(c => c.id === categoryId);
  if (cat) {
    $('#mainHeader').classList.remove('hidden');
    $('#activeCatIcon').className = cat.icon;
    $('#activeCatName').textContent = cat.name;

    // Hide delete/edit button for default category
    $('#btnDeleteCategory').classList.toggle('hidden', cat.isDefault);
    $('#btnEditCategory').classList.toggle('hidden', cat.isDefault);
  }
}

function setupDragDrop(el) {
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', el.dataset.id);
    el.classList.add('dragging');
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    $$('.cat-item').forEach(item => item.classList.remove('drag-over'));
  });

  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drag-over');
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over');
  });

  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const draggedId = e.dataTransfer.getData('text/plain');
    const targetId = el.dataset.id;
    if (draggedId === targetId) return;

    const items = [...$$('.cat-item')];
    const ids = items.map(item => item.dataset.id);
    const fromIndex = ids.indexOf(draggedId);
    const toIndex = ids.indexOf(targetId);
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, draggedId);

    try {
      await reorderCategories(ids);
      await loadCategories();
      showToast('Categories reordered');
    } catch (err) {
      showToast(err.message || 'Không sắp xếp được');
    }
  });
}

// ==================== BOOKMARKS ====================

async function loadBookmarks(categoryId) {
  let bookmarks;
  try {
    bookmarks = await getBookmarksByCategory(categoryId);
  } catch (err) {
    showToast(err.message || 'Không tải được bookmark');
    return;
  }
  const container = $('#bookmarkList');
  $('#searchResults').classList.add('hidden');
  container.classList.remove('hidden');

  $('#activeCatCount').textContent = `${bookmarks.length} bookmark`;

  if (bookmarks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-bookmark"></i>
        No bookmarks in this category yet
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  bookmarks.sort((a, b) => b.createdAt - a.createdAt).forEach(bm => {
    container.appendChild(createBookmarkElement(bm));
  });
}

function createBookmarkElement(bm) {
  const el = document.createElement('div');
  el.className = 'bm-item';
  el.dataset.id = bm.id;
  el.innerHTML = `
    <img class="bm-favicon" src="${escapeHtml(bm.favicon)}" alt="" onerror="this.src='../assets/icons/icon16.png'">
    <div class="bm-info">
      <div class="bm-title">${escapeHtml(bm.title)}</div>
      <div class="bm-url">${escapeHtml(bm.url)}</div>
    </div>
    <div class="bm-actions">
      <button class="btn-icon btn-edit-bm" title="Edit"><i class="fa-solid fa-pen"></i></button>
      <button class="btn-icon btn-delete-bm" title="Delete"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;

  // Click to open URL
  el.querySelector('.bm-info').addEventListener('click', () => {
    chrome.tabs.create({ url: bm.url });
  });

  // Edit
  el.querySelector('.btn-edit-bm').addEventListener('click', () => openEditBookmarkModal(bm));

  // Delete
  el.querySelector('.btn-delete-bm').addEventListener('click', () => {
    showConfirm(`Delete bookmark "${bm.title}"?`, async () => {
      try {
        await deleteBookmark(bm.id);
        await loadBookmarks(activeCategoryId);
        await loadCategories();
        showToast('Bookmark deleted');
      } catch (err) {
        showToast(err.message || 'Không xóa được bookmark');
      }
    });
  });

  return el;
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  // Add Category
  $('#btnAddCategory').addEventListener('click', openAddCategoryModal);
  $('#btnCancelCategory').addEventListener('click', closeCategoryModal);
  $('#btnSaveCategory').addEventListener('click', saveCurrentCategory);

  // Edit/Delete Category
  $('#btnEditCategory').addEventListener('click', openEditCategoryModal);
  $('#btnDeleteCategory').addEventListener('click', confirmDeleteCategory);

  // Add Bookmark
  $('#btnAddBookmark').addEventListener('click', openAddBookmarkModal);
  $('#btnCancelBookmark').addEventListener('click', closeBookmarkModal);
  $('#btnSaveBookmark').addEventListener('click', saveCurrentBookmark);

  // Import
  $('#btnImport').addEventListener('click', startImport);
  $('#btnCloseImport').addEventListener('click', () => {
    $('#importModal').classList.add('hidden');
  });

  // Confirm modal
  $('#btnCancelConfirm').addEventListener('click', () => {
    $('#confirmModal').classList.add('hidden');
    confirmCallback = null;
  });
  $('#btnConfirm').addEventListener('click', () => {
    $('#confirmModal').classList.add('hidden');
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });

  // Search
  let searchTimeout;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length === 0) {
      $('#searchResults').classList.add('hidden');
      $('#bookmarkList').classList.remove('hidden');
      return;
    }
    searchTimeout = setTimeout(() => performSearch(query), 300);
  });

  // Close modals on overlay click
  ['categoryModal', 'bookmarkModal', 'confirmModal', 'importModal'].forEach(id => {
    $(`#${id}`).addEventListener('click', (e) => {
      if (e.target.id === id) $(`#${id}`).classList.add('hidden');
    });
  });

  // Icon search
  $('#iconSearch').addEventListener('input', (e) => {
    filterIcons(e.target.value.trim());
  });
}

// ==================== CATEGORY MODAL ====================

function openAddCategoryModal() {
  $('#categoryModalTitle').textContent = 'Add Category';
  $('#catName').value = '';
  $('#selectedIcon').value = 'fa-solid fa-folder';
  $('#selectedIconPreview').className = 'fa-solid fa-folder';
  $('#editCategoryId').value = '';
  updateIconSelection('fa-solid fa-folder');
  $('#categoryModal').classList.remove('hidden');
  $('#catName').focus();
}

async function openEditCategoryModal() {
  if (!activeCategoryId) return;
  let categories;
  try {
    categories = await getCategories();
  } catch (err) {
    showToast(err.message || 'Lỗi tải danh mục');
    return;
  }
  const cat = categories.find(c => c.id === activeCategoryId);
  if (!cat) return;

  $('#categoryModalTitle').textContent = 'Edit Category';
  $('#catName').value = cat.name;
  $('#selectedIcon').value = cat.icon;
  $('#selectedIconPreview').className = cat.icon;
  $('#editCategoryId').value = cat.id;
  updateIconSelection(cat.icon);
  $('#categoryModal').classList.remove('hidden');
  $('#catName').focus();
}

function closeCategoryModal() {
  $('#categoryModal').classList.add('hidden');
}

async function saveCurrentCategory() {
  const name = $('#catName').value.trim();
  const icon = $('#selectedIcon').value;
  const editId = $('#editCategoryId').value;

  if (!name) {
    showToast('Please enter a category name');
    return;
  }

  try {
    if (editId) {
      await updateCategory(editId, { name, icon });
      showToast('Category updated');
    } else {
      const newCat = await addCategory(name, icon);
      activeCategoryId = newCat.id;
      showToast('New category added');
    }
  } catch (err) {
    showToast(err.message || 'Không lưu được danh mục');
    return;
  }

  closeCategoryModal();
  await loadCategories();
  if (activeCategoryId) await selectCategory(activeCategoryId);
}

async function confirmDeleteCategory() {
  if (!activeCategoryId) return;
  let categories;
  try {
    categories = await getCategories();
  } catch (err) {
    showToast(err.message || 'Lỗi tải danh mục');
    return;
  }
  const cat = categories.find(c => c.id === activeCategoryId);
  if (!cat || cat.isDefault) return;

  showConfirm(
    `Delete category "${cat.name}"? All bookmarks will be moved to "All".`,
    async () => {
      try {
        await deleteCategory(activeCategoryId);
      } catch (err) {
        showToast(err.message || 'Không xóa được danh mục');
        return;
      }
      // Chọn lại danh mục mặc định (ID do server sinh, không cố định).
      const fresh = await getCategories();
      const defaultCat = fresh.find(c => c.isDefault);
      activeCategoryId = defaultCat ? defaultCat.id : null;
      await loadCategories();
      if (activeCategoryId) await selectCategory(activeCategoryId);
      showToast('Category deleted');
    }
  );
}

// ==================== ICON PICKER ====================

function renderIconPicker(filter = '') {
  const container = $('#iconPicker');
  container.innerHTML = '';
  const selectedIcon = $('#selectedIcon').value;
  const q = filter.toLowerCase();

  const filtered = filter
    ? ICON_LIST.filter(icon => icon.toLowerCase().includes(q))
    : ICON_LIST;

  filtered.forEach(icon => {
    const el = document.createElement('div');
    el.className = `icon-option${icon === selectedIcon ? ' selected' : ''}`;
    el.innerHTML = `<i class="${icon}"></i>`;
    el.title = icon.replace('fa-solid ', '').replace('fa-brands ', '');
    el.addEventListener('click', () => {
      $('#selectedIcon').value = icon;
      $('#selectedIconPreview').className = icon;
      updateIconSelection(icon);
    });
    container.appendChild(el);
  });
}

function updateIconSelection(selectedIcon) {
  $$('.icon-option').forEach(el => {
    const iconClass = el.querySelector('i').className;
    el.classList.toggle('selected', iconClass === selectedIcon);
  });
}

function filterIcons(query) {
  renderIconPicker(query);
}

// ==================== BOOKMARK MODAL ====================

async function openAddBookmarkModal() {
  $('#bookmarkModalTitle').textContent = 'Add Bookmark';
  $('#bmTitle').value = '';
  $('#bmUrl').value = '';
  $('#editBookmarkId').value = '';

  await populateCategorySelect(activeCategoryId);
  $('#bookmarkModal').classList.remove('hidden');
  $('#bmTitle').focus();
}

async function openEditBookmarkModal(bm) {
  $('#bookmarkModalTitle').textContent = 'Edit Bookmark';
  $('#bmTitle').value = bm.title;
  $('#bmUrl').value = bm.url;
  $('#editBookmarkId').value = bm.id;

  await populateCategorySelect(bm.categoryId);
  $('#bookmarkModal').classList.remove('hidden');
  $('#bmTitle').focus();
}

async function populateCategorySelect(selectedId) {
  let categories;
  try {
    categories = await getCategories();
  } catch (err) {
    showToast(err.message || 'Lỗi tải danh mục');
    return;
  }
  const select = $('#bmCategory');
  select.innerHTML = '';
  categories.sort((a, b) => a.order - b.order).forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

function closeBookmarkModal() {
  $('#bookmarkModal').classList.add('hidden');
}

async function saveCurrentBookmark() {
  const title = $('#bmTitle').value.trim();
  const url = $('#bmUrl').value.trim();
  const categoryId = $('#bmCategory').value;
  const editId = $('#editBookmarkId').value;

  if (!url) {
    showToast('Please enter a URL');
    return;
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    showToast('Invalid URL');
    return;
  }

  try {
    if (editId) {
      await updateBookmark(editId, { title: title || url, url, categoryId });
      showToast('Bookmark updated');
    } else {
      const result = await addBookmark(title || url, url, categoryId);
      if (result.duplicate) {
        showToast('Bookmark already exists in this category');
        return;
      }
      showToast('Bookmark added');
    }
  } catch (err) {
    showToast(err.message || 'Không lưu được bookmark');
    return;
  }

  closeBookmarkModal();
  await loadCategories();
  if (activeCategoryId) await loadBookmarks(activeCategoryId);
}

// ==================== SEARCH ====================

async function performSearch(query) {
  const container = $('#searchResults');
  const bookmarkList = $('#bookmarkList');

  let results;
  try {
    results = await searchBookmarks(query);
  } catch (err) {
    showToast(err.message || 'Tìm kiếm thất bại');
    return;
  }

  bookmarkList.classList.add('hidden');
  container.classList.remove('hidden');

  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state">No results found</div>';
    return;
  }

  container.innerHTML = '';
  results.forEach(bm => {
    container.appendChild(createBookmarkElement(bm));
  });
}

// ==================== IMPORT ====================

async function startImport() {
  $('#importModal').classList.remove('hidden');
  $('#importStatus').textContent = 'Importing bookmarks from Chrome...';
  $('#progressFill').style.width = '30%';
  $('#btnCloseImport').classList.add('hidden');

  try {
    const result = await importChromeBookmarks();
    $('#progressFill').style.width = '100%';
    $('#importStatus').textContent = `Import successful! Added ${result.count} new bookmarks.`;
    $('#btnCloseImport').classList.remove('hidden');

    await loadCategories();
    if (activeCategoryId) await loadBookmarks(activeCategoryId);
  } catch (err) {
    $('#importStatus').textContent = 'Import error: ' + err.message;
    $('#btnCloseImport').classList.remove('hidden');
  }
}

// ==================== CHECK ACTIVE CATEGORY ====================

async function checkActiveCategory() {
  const result = await chrome.storage.local.get('activeCategoryId');
  if (result.activeCategoryId) {
    await selectCategory(result.activeCategoryId);
    await chrome.storage.local.remove('activeCategoryId');
  }
}

// ==================== UTILS ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  const existing = $('#toast');
  existing.remove();
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
