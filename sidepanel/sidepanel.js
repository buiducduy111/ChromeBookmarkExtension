import {
  getCategories, saveCategories, addCategory, updateCategory, deleteCategory,
  reorderCategories, getBookmarks, getBookmarksByCategory, addBookmark,
  updateBookmark, deleteBookmark, searchBookmarks, importChromeBookmarks,
  getCategoryStats, initDefaultData
} from '../shared/bookmark-manager.js';
import { ICON_LIST } from '../shared/icon-list.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let activeCategoryId = null;
let confirmCallback = null;

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', async () => {
  await initDefaultData();
  await loadCategories();
  checkActiveCategory();
  setupEventListeners();
  renderIconPicker();
});

// ==================== CATEGORIES ====================

async function loadCategories() {
  const stats = await getCategoryStats();
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
  const categories = await getCategories();
  const cat = categories.find(c => c.id === categoryId);
  if (cat) {
    $('#mainHeader').classList.remove('hidden');
    $('#activeCatIcon').className = cat.icon;
    $('#activeCatName').textContent = cat.name;

    // Hide delete button for default category
    $('#btnDeleteCategory').classList.toggle('hidden', cat.isDefault);
    // Hide edit for default category
    $('#btnEditCategory').classList.toggle('hidden', cat.isDefault);
  }

  // Update count
  const bookmarks = await getBookmarksByCategory(categoryId);
  $('#activeCatCount').textContent = `${bookmarks.length} bookmark`;
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

    await reorderCategories(ids);
    await loadCategories();
    showToast('Categories reordered');
  });
}

// ==================== BOOKMARKS ====================

async function loadBookmarks(categoryId) {
  const bookmarks = await getBookmarksByCategory(categoryId);
  const container = $('#bookmarkList');
  $('#searchResults').classList.add('hidden');
  container.classList.remove('hidden');

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
      await deleteBookmark(bm.id);
      await loadBookmarks(activeCategoryId);
      await loadCategories();
      showToast('Bookmark deleted');
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
  const categories = await getCategories();
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

  if (editId) {
    await updateCategory(editId, { name, icon });
    showToast('Category updated');
  } else {
    const newCat = await addCategory(name, icon);
    activeCategoryId = newCat.id;
    showToast('New category added');
  }

  closeCategoryModal();
  await loadCategories();
  if (activeCategoryId) await selectCategory(activeCategoryId);
}

async function confirmDeleteCategory() {
  if (!activeCategoryId) return;
  const categories = await getCategories();
  const cat = categories.find(c => c.id === activeCategoryId);
  if (!cat || cat.isDefault) return;

  showConfirm(
    `Delete category "${cat.name}"? All bookmarks will be moved to "All".`,
    async () => {
      await deleteCategory(activeCategoryId);
      activeCategoryId = 'cat_default';
      await loadCategories();
      await selectCategory('cat_default');
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
  const categories = await getCategories();
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

  closeBookmarkModal();
  await loadCategories();
  if (activeCategoryId) await loadBookmarks(activeCategoryId);
}

// ==================== SEARCH ====================

async function performSearch(query) {
  const results = await searchBookmarks(query);
  const container = $('#searchResults');
  const bookmarkList = $('#bookmarkList');

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

function showConfirm(message, callback) {
  $('#confirmMessage').textContent = message;
  confirmCallback = callback;
  $('#confirmModal').classList.remove('hidden');
}
