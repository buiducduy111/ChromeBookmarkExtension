import { SyncStorage } from './storage.js';

const CATEGORIES_KEY = 'categories';
const BOOKMARKS_PREFIX = 'bookmarks';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function getFavicon(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '';
  }
}

// ==================== CATEGORIES ====================

export async function getCategories() {
  const categories = await SyncStorage.get(CATEGORIES_KEY);
  return categories || [];
}

export async function saveCategories(categories) {
  await SyncStorage.set(CATEGORIES_KEY, categories);
}

export async function addCategory(name, icon = 'fa-solid fa-folder') {
  const categories = await getCategories();
  const maxOrder = categories.reduce((max, c) => Math.max(max, c.order), -1);
  const newCat = {
    id: 'cat_' + generateId(),
    name,
    icon,
    order: maxOrder + 1,
    isDefault: false
  };
  categories.push(newCat);
  await saveCategories(categories);
  return newCat;
}

export async function updateCategory(id, updates) {
  const categories = await getCategories();
  const index = categories.findIndex(c => c.id === id);
  if (index === -1) return null;
  Object.assign(categories[index], updates);
  await saveCategories(categories);
  return categories[index];
}

export async function deleteCategory(id) {
  const categories = await getCategories();
  const cat = categories.find(c => c.id === id);
  if (!cat || cat.isDefault) return false;

  // Move bookmarks to default category
  const bookmarks = await getBookmarks();
  const defaultCat = categories.find(c => c.isDefault);
  const updated = bookmarks.map(b =>
    b.categoryId === id ? { ...b, categoryId: defaultCat.id } : b
  );
  await saveBookmarks(updated);

  const filtered = categories.filter(c => c.id !== id);
  await saveCategories(filtered);
  return true;
}

export async function reorderCategories(orderedIds) {
  const categories = await getCategories();
  orderedIds.forEach((id, index) => {
    const cat = categories.find(c => c.id === id);
    if (cat) cat.order = index;
  });
  categories.sort((a, b) => a.order - b.order);
  await saveCategories(categories);
}

// ==================== BOOKMARKS ====================

export async function getBookmarks() {
  return await SyncStorage.loadChunked(BOOKMARKS_PREFIX);
}

export async function saveBookmarks(bookmarks) {
  await SyncStorage.saveChunked(BOOKMARKS_PREFIX, bookmarks);
}

export async function getBookmarksByCategory(categoryId) {
  const bookmarks = await getBookmarks();
  return bookmarks.filter(b => b.categoryId === categoryId);
}

export async function addBookmark(title, url, categoryId) {
  const bookmarks = await getBookmarks();
  // Check duplicate URL in same category
  const exists = bookmarks.find(b => b.url === url && b.categoryId === categoryId);
  if (exists) return { duplicate: true, bookmark: exists };

  const newBookmark = {
    id: 'bm_' + generateId(),
    title: title || url,
    url,
    favicon: getFavicon(url),
    categoryId,
    createdAt: Date.now()
  };
  bookmarks.push(newBookmark);
  await saveBookmarks(bookmarks);
  return { duplicate: false, bookmark: newBookmark };
}

export async function updateBookmark(id, updates) {
  const bookmarks = await getBookmarks();
  const index = bookmarks.findIndex(b => b.id === id);
  if (index === -1) return null;
  if (updates.url && updates.url !== bookmarks[index].url) {
    updates.favicon = getFavicon(updates.url);
  }
  Object.assign(bookmarks[index], updates);
  await saveBookmarks(bookmarks);
  return bookmarks[index];
}

export async function deleteBookmark(id) {
  const bookmarks = await getBookmarks();
  const filtered = bookmarks.filter(b => b.id !== id);
  if (filtered.length === bookmarks.length) return false;
  await saveBookmarks(filtered);
  return true;
}

export async function searchBookmarks(query) {
  const bookmarks = await getBookmarks();
  const q = query.toLowerCase();
  return bookmarks.filter(
    b => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
  );
}

// ==================== IMPORT ====================

export async function importChromeBookmarks() {
  const categories = await getCategories();
  const defaultCat = categories.find(c => c.isDefault);
  if (!defaultCat) return { count: 0 };

  const existingBookmarks = await getBookmarks();
  const existingUrls = new Set(existingBookmarks.map(b => b.url));

  const tree = await chrome.bookmarks.getTree();
  const imported = [];

  function traverse(nodes) {
    for (const node of nodes) {
      if (node.url && !existingUrls.has(node.url)) {
        imported.push({
          id: 'bm_' + generateId(),
          title: node.title || node.url,
          url: node.url,
          favicon: getFavicon(node.url),
          categoryId: defaultCat.id,
          createdAt: Date.now()
        });
        existingUrls.add(node.url);
      }
      if (node.children) traverse(node.children);
    }
  }

  traverse(tree);

  const allBookmarks = [...existingBookmarks, ...imported];
  await saveBookmarks(allBookmarks);
  return { count: imported.length };
}

// ==================== INIT ====================

export async function initDefaultData() {
  const categories = await getCategories();
  if (categories.length === 0) {
    await saveCategories([
      {
        id: 'cat_default',
        name: 'All',
        icon: 'fa-solid fa-bookmark',
        order: 0,
        isDefault: true
      }
    ]);
  }
}

// ==================== STATS ====================

export async function getCategoryStats() {
  const categories = await getCategories();
  const bookmarks = await getBookmarks();
  return categories
    .sort((a, b) => a.order - b.order)
    .map(cat => ({
      ...cat,
      count: bookmarks.filter(b => b.categoryId === cat.id).length
    }));
}
