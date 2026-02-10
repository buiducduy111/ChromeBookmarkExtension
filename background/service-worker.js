// Initialize default data on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const result = await chrome.storage.sync.get('categories');
    if (!result.categories || result.categories.length === 0) {
      await chrome.storage.sync.set({
        categories: [
          {
            id: 'cat_default',
            name: 'All',
            icon: 'fa-solid fa-bookmark',
            order: 0,
            isDefault: true
          }
        ]
      });
    }
  }
});

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
