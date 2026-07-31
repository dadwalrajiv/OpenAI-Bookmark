import { Message } from '../../types/platform';
import { Bookmark } from '../../types/bookmark';
import { BookmarkStorage } from '../../utils/storage';
import { InputSanitizer } from '../../utils/sanitizer';
import { PlatformAdapter } from '../../types/platform';

export function bookmarkButtonExists(messageElement: HTMLElement): boolean {
  if (messageElement.querySelector('.bookmark-button')) return true;
  if (messageElement.hasAttribute('data-bookmark-processed')) return true;
  let searchElement: HTMLElement | null = messageElement;
  let attempts = 0;
  while (searchElement && attempts < 5) {
    if (searchElement.querySelector('.bookmark-button')) return true;
    searchElement = searchElement.parentElement;
    attempts++;
  }
  return false;
}

export let bookmarkedMessageIds = new Set<string>();
export const bookmarksMap = new Map<string, Bookmark>();

/**
 * Handle bookmark click.
 * platformPosition carries platform-specific scroll position data
 * (posinset for Claude, turnNumber for ChatGPT) captured at save time
 * while the element is in the DOM. Stored in the Bookmark so navigation
 * works reliably in future sessions without any DOM scanning.
 */
export async function handleBookmarkClick(
  message: Message,
  currentPlatform: PlatformAdapter,
  updateButtonCallback: (button: Element, iconContainer: HTMLElement) => void,
  platformPosition?: { posinset?: number; turnNumber?: number }
): Promise<void> {
  const rawNote = prompt('Add a note for this bookmark (optional):');
  if (rawNote === null) return;

  const sanitizedNote = InputSanitizer.sanitizeText(rawNote, 500);
  const sanitizedMessageText = InputSanitizer.sanitizeText(message.text, 500);

  const bookmarkId = `bookmark_${Date.now()}_${
    crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9)
  }`;

  const bookmark: Bookmark = {
    id: bookmarkId,
    platform: currentPlatform.name,
    conversationId: currentPlatform.getConversationId(),
    messageId: message.id,
    messageText: sanitizedMessageText,
    note: sanitizedNote,
    tags: [],
    timestamp: Date.now(),
    url: window.location.href,
    ...(platformPosition?.posinset && { posinset: platformPosition.posinset }),
    ...(platformPosition?.turnNumber && { turnNumber: platformPosition.turnNumber }),
  };

  try {
    await BookmarkStorage.save(bookmark);
    bookmarkedMessageIds.add(message.id);
    bookmarksMap.set(message.id, bookmark);

    // Find and update the button visual state
    let button: Element | null = message.element.querySelector('.bookmark-button');
    if (!button) {
      let searchElement: HTMLElement | null = message.element;
      let attempts = 0;
      while (searchElement && attempts < 10) {
        button = searchElement.querySelector('.bookmark-button');
        if (button) break;
        searchElement = searchElement.parentElement;
        attempts++;
      }
    }

    if (button) {
      const iconContainer: HTMLElement | null =
        button.querySelector('div') ??
        button.querySelector('span span') ??
        button.querySelector('span');
      if (iconContainer) updateButtonCallback(button, iconContainer);
    }

    window.dispatchEvent(new CustomEvent('bookmarkAdded', { detail: bookmark }));
  } catch (error) {
    console.error('❌ Error saving bookmark:', error);
    alert('Failed to save bookmark. Please try again.');
  }
}

export function handleSidebarBookmarkClick(
  bookmark: Bookmark,
  currentPlatform: PlatformAdapter | null
): void {
  if (!currentPlatform) return;
  currentPlatform.scrollToMessage(bookmark.messageId);
}

export async function loadBookmarksForConversation(conversationId: string): Promise<void> {
  try {
    const bookmarks = await BookmarkStorage.getByConversation(conversationId);
    bookmarkedMessageIds.clear();
    bookmarksMap.clear();
    bookmarks.forEach(bookmark => {
      bookmarkedMessageIds.add(bookmark.messageId);
      bookmarksMap.set(bookmark.messageId, bookmark);
    });
  } catch (error) {
    console.error('❌ Error loading bookmarks:', error);
  }
}

export function getBookmark(messageId: string): Bookmark | null {
  return bookmarksMap.get(messageId) || null;
}

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