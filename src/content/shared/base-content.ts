import { Message } from '../../types/platform';
import { Bookmark } from '../../types/bookmark';
import { BookmarkStorage } from '../../utils/storage';
import { InputSanitizer } from '../../utils/sanitizer';
import { PlatformAdapter } from '../../types/platform';

/**
 * Check if bookmark button already exists for this message
 * Searches in message element and parent containers
 */
export function bookmarkButtonExists(messageElement: HTMLElement): boolean {
  // Check in message element itself
  if (messageElement.querySelector('.bookmark-button')) {
    return true;
  }
  
  // Check in parent containers (up to 5 levels)
  let searchElement: HTMLElement | null = messageElement;
  let attempts = 0;
  
  while (searchElement && attempts < 5) {
    // Look for bookmark button in this level
    const button = searchElement.querySelector('.bookmark-button');
    if (button) {
      // Verify this button is associated with our message
      // by checking if it's within reasonable proximity
      const buttonRect = button.getBoundingClientRect();
      const messageRect = messageElement.getBoundingClientRect();
      
      // If button is within message's vertical bounds (with 100px margin)
      if (Math.abs(buttonRect.top - messageRect.top) < 100) {
        return true;
      }
    }
    
    searchElement = searchElement.parentElement;
    attempts++;
  }
  
  return false;
}
/**
 * Shared state - used by all platforms
 */
export let bookmarkedMessageIds = new Set<string>();
export const bookmarksMap = new Map<string, Bookmark>();  // ADD THIS LINE

/**
 * Handle bookmark click - SHARED across all platforms
 */
export async function handleBookmarkClick(
  message: Message,
  currentPlatform: PlatformAdapter,
  updateButtonCallback: (button: Element, iconContainer: HTMLElement) => void
): Promise<void> {
  console.log('🎯 Bookmark clicked!');
  
  const rawNote = prompt('Add a note for this bookmark (optional):');
  
  if (rawNote === null) {
    console.log('⏭️  Bookmark cancelled by user');
    return;
  }
  
  const sanitizedNote = InputSanitizer.sanitizeText(rawNote, 500);
  const sanitizedMessageText = InputSanitizer.sanitizeText(message.text, 500);
  
  const bookmarkId = `bookmark_${Date.now()}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9)}`;
  
  const bookmark: Bookmark = {
    id: bookmarkId,
    platform: currentPlatform.name,
    conversationId: currentPlatform.getConversationId(),
    messageId: message.id,
    messageText: sanitizedMessageText,
    note: sanitizedNote,
    tags: [],
    timestamp: Date.now(),
    url: window.location.href
  };
  
  console.log('💾 Saving bookmark:', bookmark);
  
  try {
    await BookmarkStorage.save(bookmark);
    
    // Add to tracked set
    bookmarkedMessageIds.add(message.id);
    
    // Find and update button
    let button: Element | null = message.element.querySelector('.bookmark-button');
    
    if (!button) {
      let searchElement: HTMLElement | null = message.element;
      let attempts = 0;
      
      while (searchElement && attempts < 10) {
        button = searchElement.querySelector('.bookmark-button');
        if (button) {
          console.log(`✅ Found button at level ${attempts + 1}`);
          break;
        }
        searchElement = searchElement.parentElement;
        attempts++;
      }
    }
    
    if (button) {
      // Find icon container - platform-specific logic passed via callback
      let iconContainer: HTMLElement | null = button.querySelector('div');
      if (!iconContainer) iconContainer = button.querySelector('span span');
      if (!iconContainer) iconContainer = button.querySelector('span');
      
      if (iconContainer) {
        updateButtonCallback(button, iconContainer);
        console.log('✅ Button updated to bookmarked state');
      }
    }
    
    //console.log('✅ Bookmark saved successfully!');
    window.dispatchEvent(new CustomEvent('bookmarkAdded', { detail: bookmark }));
    
  } catch (error) {
    console.error('❌ Error saving bookmark:', error);
    alert('Failed to save bookmark. Please try again.');
  }
}

/**
 * Handle sidebar bookmark click - SHARED
 */
export function handleSidebarBookmarkClick(
  bookmark: Bookmark,
  currentPlatform: PlatformAdapter | null
): void {
  //console.log('🎯 Sidebar bookmark clicked:', bookmark.id);
  
  if (!currentPlatform) {
    console.warn('⚠️  Platform not initialized');
    return;
  }
  
  const allMessageElements = document.querySelectorAll('[data-message-id]');
  //console.log(`🔍 Total messages with IDs in DOM: ${allMessageElements.length}`);
  
  currentPlatform.scrollToMessage(bookmark.messageId);
}

/**
 * Load bookmarks for conversation - SHARED
 */
export async function loadBookmarksForConversation(conversationId: string): Promise<void> {
  try {
    const bookmarks = await BookmarkStorage.getByConversation(conversationId);
    //console.log(`📖 Found ${bookmarks.length} existing bookmarks for this conversation`);
    
    // Clear and rebuild lookup structures
    bookmarkedMessageIds.clear();
    bookmarksMap.clear();  // ADD THIS
    
    bookmarks.forEach(bookmark => {
      bookmarkedMessageIds.add(bookmark.messageId);
      bookmarksMap.set(bookmark.messageId, bookmark);  // ADD THIS
    });
    
    //console.log(`🔖 Tracking ${bookmarkedMessageIds.size} bookmarked messages`);
    
  } catch (error) {
    console.error('❌ Error loading bookmarks:', error);
  }
}

/**
 * Get bookmark for a message (synchronous O(1) lookup)
 */
export function getBookmark(messageId: string): Bookmark | null {
  return bookmarksMap.get(messageId) || null;
}
/**
 * Find bookmark for a message ID
 */
export async function findBookmarkForMessage(
  messageId: string, 
  conversationId: string
): Promise<Bookmark | null> {
  try {
    const bookmarks = await BookmarkStorage.getByConversation(conversationId);
    return bookmarks.find(b => b.messageId === messageId) || null;
  } catch (error) {
    console.error('Error finding bookmark:', error);
    return null;
  }
}

