// Dữ liệu (kể cả category mặc định "All") do backend tạo khi đăng ký tài khoản,
// nên service worker không còn khởi tạo gì trong chrome.storage.sync.

// Enable side panel on all pages
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

// Context menu: right-click to add bookmark
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'add-bookmark',
    title: 'Add to Bookmark Manager',
    contexts: ['page', 'link']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'add-bookmark') {
    const url = info.linkUrl || info.pageUrl || tab.url;
    const title = tab.title || url;

    // Store temp data for popup to pick up
    await chrome.storage.local.set({
      pendingBookmark: { title, url, fromContextMenu: true }
    });

    // Try to open popup (may not work in all contexts)
    try {
      await chrome.action.openPopup();
    } catch {
      // Fallback: open side panel instead
      chrome.sidePanel.open({ windowId: tab.windowId });
    }
  }
});
