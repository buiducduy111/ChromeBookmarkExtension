/**
 * Lớp gọi HTTP tới backend Laravel.
 * Tự gắn Bearer token, parse JSON, và xử lý 401 (hết hạn/không hợp lệ).
 */
import { API_BASE_URL, TOKEN_KEY, USER_KEY } from './config.js';

/** Lỗi API có kèm HTTP status và payload trả về. */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Các UI đăng ký callback để hiện lại màn hình đăng nhập khi gặp 401.
const unauthorizedHandlers = new Set();

export function onUnauthorized(handler) {
  unauthorizedHandlers.add(handler);
}

async function getToken() {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return result[TOKEN_KEY] || null;
}

/**
 * Gọi API.
 * @param {string} path - đường dẫn sau /api, vd "/bookmarks"
 * @param {{method?: string, body?: any, auth?: boolean}} options
 * @returns {Promise<any>} JSON đã parse (hoặc null nếu 204)
 */
export async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Lỗi mạng / server không chạy.
    throw new ApiError('Không kết nối được tới máy chủ. Kiểm tra backend đang chạy?', 0, null);
  }

  // 401: token sai/hết hạn -> xóa token và báo cho UI.
  if (response.status === 401) {
    await chrome.storage.local.remove([TOKEN_KEY, USER_KEY]);
    unauthorizedHandlers.forEach((h) => {
      try { h(); } catch { /* noop */ }
    });
    throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401, null);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!response.ok) {
    const message = (data && data.message) || `Yêu cầu thất bại (HTTP ${response.status})`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}
