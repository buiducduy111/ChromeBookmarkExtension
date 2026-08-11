/**
 * Lớp dữ liệu bookmark/category — nay gọi thẳng tới backend Laravel qua REST API.
 * Giữ nguyên chữ ký các hàm export để popup.js / sidepanel.js không phải đổi.
 *
 * Ghi chú ID: server trả ID kiểu số. Ta chuẩn hóa mọi ID về String khi đưa vào
 * client để giữ nguyên logic so sánh (===) và data-* thuộc tính của UI hiện có.
 */
import { apiFetch } from './api.js';

// ==================== HELPERS ====================

function getFavicon(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '';
  }
}

function normalizeCategory(cat) {
  return {
    id: String(cat.id),
    name: cat.name,
    icon: cat.icon,
    order: cat.order,
    isDefault: !!cat.isDefault,
    count: cat.count ?? 0,
  };
}

function normalizeBookmark(bm) {
  return {
    id: String(bm.id),
    title: bm.title,
    url: bm.url,
    favicon: bm.favicon || getFavicon(bm.url),
    categoryId: String(bm.categoryId),
    createdAt: bm.createdAt,
  };
}

// ==================== CATEGORIES ====================

export async function getCategories() {
  const res = await apiFetch('/categories');
  return (res.data || []).map(normalizeCategory);
}

export async function addCategory(name, icon = 'fa-solid fa-folder') {
  const res = await apiFetch('/categories', { method: 'POST', body: { name, icon } });
  return normalizeCategory(res.data);
}

export async function updateCategory(id, updates) {
  const res = await apiFetch(`/categories/${id}`, { method: 'PUT', body: updates });
  return normalizeCategory(res.data);
}

export async function deleteCategory(id) {
  await apiFetch(`/categories/${id}`, { method: 'DELETE' });
  return true;
}

export async function reorderCategories(orderedIds) {
  await apiFetch('/categories/reorder', { method: 'POST', body: { orderedIds } });
}

// getCategoryStats: server đã trả kèm `count` và sort theo order.
export async function getCategoryStats() {
  return await getCategories();
}

// ==================== BOOKMARKS ====================

export async function getBookmarks() {
  const res = await apiFetch('/bookmarks');
  return (res.data || []).map(normalizeBookmark);
}

export async function getBookmarksByCategory(categoryId) {
  const res = await apiFetch(`/bookmarks?category_id=${encodeURIComponent(categoryId)}`);
  return (res.data || []).map(normalizeBookmark);
}

export async function addBookmark(title, url, categoryId) {
  const res = await apiFetch('/bookmarks', {
    method: 'POST',
    body: { title, url, category_id: categoryId },
  });
  return { duplicate: !!res.duplicate, bookmark: normalizeBookmark(res.bookmark) };
}

export async function updateBookmark(id, updates) {
  const body = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.url !== undefined) body.url = updates.url;
  if (updates.categoryId !== undefined) body.category_id = updates.categoryId;
  const res = await apiFetch(`/bookmarks/${id}`, { method: 'PUT', body });
  return normalizeBookmark(res.data);
}

export async function deleteBookmark(id) {
  await apiFetch(`/bookmarks/${id}`, { method: 'DELETE' });
  return true;
}

export async function searchBookmarks(query) {
  const res = await apiFetch(`/bookmarks?q=${encodeURIComponent(query)}`);
  return (res.data || []).map(normalizeBookmark);
}

// ==================== IMPORT ====================

export async function importChromeBookmarks() {
  const categories = await getCategories();
  const defaultCat = categories.find((c) => c.isDefault);
  if (!defaultCat) return { count: 0 };

  // Thu thập toàn bộ URL từ cây bookmark của Chrome.
  const tree = await chrome.bookmarks.getTree();
  const collected = [];
  const seen = new Set();

  function traverse(nodes) {
    for (const node of nodes) {
      if (node.url && !seen.has(node.url)) {
        seen.add(node.url);
        collected.push({
          title: node.title || node.url,
          url: node.url,
          category_id: defaultCat.id,
        });
      }
      if (node.children) traverse(node.children);
    }
  }
  traverse(tree);

  if (collected.length === 0) return { count: 0 };

  const res = await apiFetch('/bookmarks/bulk', {
    method: 'POST',
    body: { bookmarks: collected },
  });
  return { count: res.count ?? 0 };
}
