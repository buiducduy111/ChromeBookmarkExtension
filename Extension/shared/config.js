/**
 * Cấu hình endpoint backend.
 *
 * Khi deploy production:
 *  1. Đổi API_BASE_URL sang domain thật (vd https://api.your-domain.com/api).
 *  2. Thêm domain đó vào "host_permissions" trong manifest.json.
 */
export const API_BASE_URL = 'http://localhost:8081/api';

// Storage key cho token & thông tin user (lưu trong chrome.storage.local).
export const TOKEN_KEY = 'authToken';
export const USER_KEY = 'authUser';
