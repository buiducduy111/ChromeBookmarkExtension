# Bookmark Manager — Backend (Laravel 10 + Sanctum)

Backend REST API lưu trữ bookmark/category theo từng tài khoản người dùng cho
Bookmark Manager Extension. Xác thực bằng **Laravel Sanctum** (token), CSDL **MySQL**.

## Yêu cầu
- PHP 8.1+ (đang dùng PHP của XAMPP 8.1.17)
- Composer
- MySQL (XAMPP MySQL đang chạy ở `127.0.0.1:3306`)

## Cài đặt
```bash
cd Backend
composer install
# .env đã được cấu hình sẵn (DB_DATABASE=bookmark_extension, root, không mật khẩu).
# Nếu clone mới:  cp .env.example .env  &&  php artisan key:generate
php artisan migrate
```

Tạo database (nếu chưa có):
```bash
# Dùng mysql của XAMPP
/c/xampp/mysql/bin/mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS bookmark_extension CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

## Chạy server (chạy trong terminal của bạn)
```bash
php artisan serve --host=127.0.0.1 --port=8000
```
API sẽ ở `http://localhost:8000/api`. Đây chính là `API_BASE_URL` mà Extension trỏ tới
(`Extension/shared/config.js`) và có trong `host_permissions` của `manifest.json`.

> Lưu ý: `API_BASE_URL` và `host_permissions` cần đổi sang domain thật khi deploy production,
> đồng thời nên siết `allowed_origins` trong `config/cors.php` về `chrome-extension://<extension-id>`.

## Chạy test
```bash
php artisan test
```
Test dùng SQLite in-memory (`phpunit.xml`), không đụng tới MySQL.

## API tóm tắt
Tất cả trả JSON. Route bảo vệ cần header `Authorization: Bearer <token>`.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/register` | Đăng ký `{name?, email, password}` → `{token, user}`, tự tạo category mặc định "All" |
| POST | `/api/login` | Đăng nhập `{email, password}` → `{token, user}` |
| POST | `/api/logout` | Thu hồi token hiện tại |
| GET | `/api/user` | Thông tin user hiện tại |
| GET | `/api/categories` | Danh sách category (kèm `count`, sort theo `order`) |
| POST | `/api/categories` | Tạo `{name, icon}` |
| PUT | `/api/categories/{id}` | Sửa `{name?, icon?}` |
| DELETE | `/api/categories/{id}` | Xóa (chặn category mặc định; dời bookmark về "All") |
| POST | `/api/categories/reorder` | `{orderedIds: [...]}` |
| GET | `/api/bookmarks` | Danh sách; hỗ trợ `?category_id=` và `?q=` |
| POST | `/api/bookmarks` | Tạo `{title, url, category_id}` → `{duplicate, bookmark}` |
| PUT | `/api/bookmarks/{id}` | Sửa `{title?, url?, category_id?}` |
| DELETE | `/api/bookmarks/{id}` | Xóa |
| POST | `/api/bookmarks/bulk` | Import hàng loạt `{bookmarks:[{title,url,category_id}]}` → `{count}` |

Định dạng field khớp client: category `{id,name,icon,order,isDefault,count}`,
bookmark `{id,title,url,favicon,categoryId,createdAt}` (`createdAt` là epoch milliseconds).
