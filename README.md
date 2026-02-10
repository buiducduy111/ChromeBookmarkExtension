# Bookmark Manager - Chrome Extension

A Chrome extension to organize your bookmarks into custom categories with FontAwesome icons. Features a quick-add popup and a full-featured side panel for managing bookmarks.

## Features

- **Category Management** — Create, edit, delete and reorder categories with custom FontAwesome icons
- **Bookmark CRUD** — Add, edit and delete bookmarks within each category; bookmark icons are automatically fetched from the website
- **Quick Add** — Click the extension icon to instantly save the current page, with a category picker dialog
- **Side Panel** — Full management UI with category sidebar and bookmark list
- **Import from Chrome** — Import all existing Chrome bookmarks into the "All" category
- **Search** — Search bookmarks by title or URL
- **Right-click Menu** — Right-click any page or link to add it to Bookmark Manager
- **Chrome Sync** — All data syncs across devices via your Google account

## Installation

### From source (Developer mode)

1. **Clone or download** this repository

2. **Install dependencies** (only needed for FontAwesome fonts):
   ```bash
   npm install
   ```

3. Open Chrome and navigate to:
   ```
   chrome://extensions
   ```

4. Enable **Developer mode** (toggle in the top-right corner)

5. Click **Load unpacked**

6. Select the `BookmarkExtension` folder

7. The extension icon will appear in the Chrome toolbar — click it to get started

### Pinning the extension

After installation, click the puzzle icon in the Chrome toolbar and pin **Bookmark Manager** for quick access.

## Usage

### Quick Add (Popup)

1. Navigate to any webpage
2. Click the Bookmark Manager icon in the toolbar
3. Click **"Add this page to bookmarks"**
4. Choose a category from the dropdown and click **Save**

### Side Panel (Full Management)

1. Click the extension icon and press the expand button (top-right), or
2. Right-click the extension icon → **Open Side Panel**

From the side panel you can:
- **Add/edit/delete categories** with custom icons
- **Drag & drop** to reorder categories
- **Add bookmarks manually** by entering a title and URL
- **Edit or delete** existing bookmarks
- **Import** all Chrome bookmarks in one click
- **Search** across all bookmarks

### Right-click Menu

Right-click any page or link → **"Add to Bookmark Manager"** to quickly save it.

## Project Structure

```
BookmarkExtension/
├── manifest.json                # Extension manifest (Manifest V3)
├── background/
│   └── service-worker.js        # Background service worker
├── popup/
│   ├── popup.html               # Popup UI
│   ├── popup.css
│   └── popup.js
├── sidepanel/
│   ├── sidepanel.html           # Side panel UI
│   ├── sidepanel.css
│   └── sidepanel.js
├── shared/
│   ├── storage.js               # Chunked Chrome Sync Storage utility
│   ├── bookmark-manager.js      # Core CRUD logic
│   ├── icon-list.js             # FontAwesome icon list for picker
│   └── common.css               # Shared styles and CSS variables
├── assets/icons/                # Extension icons
└── libs/
    ├── fontawesome-css/         # FontAwesome CSS
    └── webfonts/                # FontAwesome font files
```

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save categories and bookmarks (Chrome Sync) |
| `bookmarks` | Import existing Chrome bookmarks |
| `activeTab` | Read current tab info for quick-add |
| `sidePanel` | Display the side panel UI |
| `contextMenus` | Right-click "Add to Bookmark Manager" |

## Data & Privacy

All data is stored locally using `chrome.storage.sync` and syncs through your Google account. No data is sent to external servers. See [Privacy.md](Privacy.md) for the full privacy policy.
