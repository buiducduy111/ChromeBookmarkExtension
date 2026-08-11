# Privacy Policy - Bookmark Manager

**Last updated:** February 10, 2026

## Overview

Bookmark Manager is a Chrome extension that helps users organize their bookmarks into categories with custom icons. This privacy policy describes how the extension handles user data.

## Data Collection

Bookmark Manager does **not** collect, transmit, or share any personal data with external servers. All data is processed and stored locally on your device and through your Google account's Chrome Sync.

### Data stored by the extension

| Data | Purpose | Storage location |
|------|---------|-----------------|
| Category names and icons | Organize bookmarks into groups | `chrome.storage.sync` |
| Bookmark titles and URLs | Save and display your bookmarks | `chrome.storage.sync` |
| Website favicons | Display bookmark icons via Google Favicon API | Not stored (loaded on demand) |

### Data NOT collected

- No personal information (name, email, address)
- No browsing history or activity tracking
- No analytics or telemetry
- No cookies or tracking identifiers
- No data sent to third-party servers

## Data Storage and Sync

All data is stored using Chrome's built-in `chrome.storage.sync` API. This means:

- Data is saved locally in your Chrome profile
- If you are signed in to Chrome with a Google account and have sync enabled, your data will automatically sync across your devices through Google's infrastructure
- Data sync is handled entirely by Google Chrome — the extension does not operate its own servers

## Third-Party Services

The extension makes requests to the following external service:

- **Google Favicon API** (`https://www.google.com/s2/favicons`) — used to fetch website icons for display purposes only. No user data is sent; only the domain name of bookmarked websites is included in the request.

## Chrome Permissions

The extension requests the following permissions:

| Permission | Reason |
|------------|--------|
| `storage` | Save categories and bookmarks |
| `bookmarks` | Import existing Chrome bookmarks |
| `activeTab` | Read current tab info for quick-add feature |
| `sidePanel` | Display the side panel management UI |
| `contextMenus` | Add right-click "Add to Bookmark Manager" option |

## Data Deletion

You can delete all extension data at any time by:

1. Right-clicking the extension icon → **Manage Extension**
2. Clicking **Remove Extension**

This will remove all locally stored data. If Chrome Sync is enabled, the synced data will also be removed from your Google account.

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected in this document with an updated date.

## Contact

If you have questions about this privacy policy, please open an issue on the project's GitHub repository.
