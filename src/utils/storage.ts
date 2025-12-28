import { Bookmark } from '../types/bookmark';

export class BookmarkStorage {
  private static STORAGE_KEY = 'ai_chat_bookmarks';
  
  /**
   * Validate bookmark object before saving
   */
  private static validateBookmark(bookmark: Bookmark): boolean {
    // Check required fields exist
    if (!bookmark.id || !bookmark.platform || !bookmark.conversationId || !bookmark.messageId) {
      console.error('❌ Invalid bookmark: missing required fields', bookmark);
      return false;
    }
    
    // Check data types
    if (typeof bookmark.id !== 'string' ||
        typeof bookmark.platform !== 'string' ||
        typeof bookmark.conversationId !== 'string' ||
        typeof bookmark.messageId !== 'string' ||
        typeof bookmark.note !== 'string' ||
        typeof bookmark.messageText !== 'string' ||
        typeof bookmark.timestamp !== 'number') {
      console.error('❌ Invalid bookmark: wrong data types', bookmark);
      return false;
    }
    
    // Check string length limits
    if (bookmark.id.length > 100 ||
        bookmark.note.length > 500 ||
        bookmark.messageText.length > 1000 ||
        bookmark.url.length > 2000) {
      console.error('❌ Invalid bookmark: fields too long', bookmark);
      return false;
    }
    
    // Check platform is allowed
    const allowedPlatforms = ['claude', 'chatgpt', 'gemini', 'copilot'];
    if (!allowedPlatforms.includes(bookmark.platform)) {
      console.error('❌ Invalid bookmark: unknown platform', bookmark.platform);
      return false;
    }
    
    // Check timestamp is reasonable (not in future, not too old)
    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    if (bookmark.timestamp > now || bookmark.timestamp < oneYearAgo) {
      console.error('❌ Invalid bookmark: invalid timestamp', bookmark.timestamp);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get all bookmarks from storage
   */
  static async getAll(): Promise<Bookmark[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.STORAGE_KEY], (result) => {
        const data = result[this.STORAGE_KEY];
        const bookmarks: Bookmark[] = Array.isArray(data) ? data : [];
        
        // Validate each bookmark on load
        const validBookmarks = bookmarks.filter(b => this.validateBookmark(b));
        
        if (validBookmarks.length !== bookmarks.length) {
          console.warn(`⚠️  Filtered out ${bookmarks.length - validBookmarks.length} invalid bookmarks`);
        }
        
        //console.log(`📚 Loaded ${validBookmarks.length} valid bookmarks from storage`);
        resolve(validBookmarks);
      });
    });
  }
  
  /**
   * Get bookmarks for a specific conversation
   */
  static async getByConversation(conversationId: string): Promise<Bookmark[]> {
    const allBookmarks = await this.getAll();
    return allBookmarks.filter((b: Bookmark) => b.conversationId === conversationId);
  }
  
  /**
   * Save a new bookmark
   */
  static async save(bookmark: Bookmark): Promise<void> {
    // Validate before saving
    if (!this.validateBookmark(bookmark)) {
      throw new Error('Invalid bookmark data - cannot save');
    }
    
    const bookmarks = await this.getAll();
    
    // Check if bookmark already exists (prevent duplicates)
    const exists = bookmarks.some((b: Bookmark) => 
      b.conversationId === bookmark.conversationId && 
      b.messageId === bookmark.messageId
    );
    
    if (exists) {
      console.log('⚠️  Bookmark already exists, skipping');
      return;
    }
    
    bookmarks.push(bookmark);
    
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: bookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error('❌ Error saving bookmark:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('✅ Bookmark saved:', bookmark.id);
          resolve();
        }
      });
    });
  }
  
  /**
   * Delete a bookmark by ID
   */
  static async delete(bookmarkId: string): Promise<void> {
    const bookmarks = await this.getAll();
    const filtered = bookmarks.filter((b: Bookmark) => b.id !== bookmarkId);
    
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: filtered }, () => {
        if (chrome.runtime.lastError) {
          console.error('❌ Error deleting bookmark:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('🗑️  Bookmark deleted:', bookmarkId);
          resolve();
        }
      });
    });
  }
  
  /**
   * Clear all bookmarks (useful for testing)
   */
  static async clear(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [this.STORAGE_KEY]: [] }, () => {
        if (chrome.runtime.lastError) {
          console.error('❌ Error clearing bookmarks:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('🧹 All bookmarks cleared');
          resolve();
        }
      });
    });
  }
}