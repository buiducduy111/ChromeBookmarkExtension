/**
 * Quản lý xác thực người dùng cho Extension.
 * Token & thông tin user lưu trong chrome.storage.local.
 */
import { apiFetch } from './api.js';
import { TOKEN_KEY, USER_KEY } from './config.js';

async function persistSession({ token, user }) {
  await chrome.storage.local.set({ [TOKEN_KEY]: token, [USER_KEY]: user });
}

/** Đăng ký tài khoản mới. Trả về user và tự lưu token. */
export async function register({ name, email, password }) {
  const res = await apiFetch('/register', {
    method: 'POST',
    auth: false,
    body: { name, email, password },
  });
  await persistSession(res);
  return res.user;
}

/** Đăng nhập. Trả về user và tự lưu token. */
export async function login({ email, password }) {
  const res = await apiFetch('/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
  await persistSession(res);
  return res.user;
}

/** Đăng xuất: thu hồi token phía server rồi xóa cục bộ. */
export async function logout() {
  try {
    await apiFetch('/logout', { method: 'POST' });
  } catch {
    // Kể cả server lỗi, vẫn xóa phiên cục bộ.
  }
  await chrome.storage.local.remove([TOKEN_KEY, USER_KEY]);
}

/** Token hiện tại (hoặc null). */
export async function getToken() {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return result[TOKEN_KEY] || null;
}

/** Thông tin user đã lưu (hoặc null). */
export async function getUser() {
  const result = await chrome.storage.local.get(USER_KEY);
  return result[USER_KEY] || null;
}

/** Đã đăng nhập hay chưa. */
export async function isLoggedIn() {
  return (await getToken()) !== null;
}
