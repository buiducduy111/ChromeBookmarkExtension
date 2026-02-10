/**
 * Chunked Chrome Sync Storage utility.
 * chrome.storage.sync limits: 8KB per item, 102KB total, 512 items max.
 * This module chunks large arrays across multiple storage keys.
 */

const CHUNK_SIZE = 7000; // bytes per chunk (safe margin under 8KB)

export const SyncStorage = {
  /**
   * Save an array chunked across multiple sync storage keys.
   * @param {string} prefix - Key prefix (e.g., "bookmarks")
   * @param {Array} data - Array of items to store
   */
  async saveChunked(prefix, data) {
    // Remove old chunks first
    const meta = await this.get(`${prefix}_meta`);
    if (meta) {
      const keysToRemove = [];
      for (let i = 0; i < meta.totalChunks; i++) {
        keysToRemove.push(`${prefix}_${i}`);
      }
      await chrome.storage.sync.remove(keysToRemove);
    }

    // Split data into chunks
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;

    for (const item of data) {
      const itemSize = new Blob([JSON.stringify(item)]).size;
      if (currentSize + itemSize > CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
      }
      currentChunk.push(item);
      currentSize += itemSize;
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    // Save chunks
    const saveData = {};
    for (let i = 0; i < chunks.length; i++) {
      saveData[`${prefix}_${i}`] = chunks[i];
    }
    saveData[`${prefix}_meta`] = {
      totalChunks: chunks.length,
      totalCount: data.length
    };

    await chrome.storage.sync.set(saveData);
  },

  /**
   * Load all chunks and return combined array.
   * @param {string} prefix - Key prefix
   * @returns {Array}
   */
  async loadChunked(prefix) {
    const meta = await this.get(`${prefix}_meta`);
    if (!meta || meta.totalChunks === 0) return [];

    const keys = [];
    for (let i = 0; i < meta.totalChunks; i++) {
      keys.push(`${prefix}_${i}`);
    }

    const result = await chrome.storage.sync.get(keys);
    const allData = [];
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunk = result[`${prefix}_${i}`];
      if (chunk) allData.push(...chunk);
    }
    return allData;
  },

  /**
   * Get a single key from sync storage.
   */
  async get(key) {
    const result = await chrome.storage.sync.get(key);
    return result[key] || null;
  },

  /**
   * Set a single key in sync storage.
   */
  async set(key, value) {
    await chrome.storage.sync.set({ [key]: value });
  },

  /**
   * Remove keys from sync storage.
   */
  async remove(keys) {
    await chrome.storage.sync.remove(keys);
  }
};
