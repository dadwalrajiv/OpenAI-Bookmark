import { GeminiPlatform } from '../platforms/gemini';
import { PlatformAdapter, Message } from '../types/platform';
import { injectSidebar } from '../sidebar/index';
import {
  handleBookmarkClick,
  handleSidebarBookmarkClick,
  loadBookmarksForConversation,
  bookmarkButtonExists,
  getBookmark
} from './shared/base-content';
import {
  safeExecute,
  safeExecuteAsync,
  setupGlobalErrorHandler,
  safeDOMOperation,
  safeMutationCallback
} from './shared/error-handler';

setupGlobalErrorHandler('Gemini');

let currentPlatform: GeminiPlatform | null = null;
let observer: MutationObserver | null = null;
let injectionTimeout: NodeJS.Timeout | null = null;
let lastUrl = window.location.href;

// Grow-only — Gemini doesn't virtualize but we keep the same pattern
// for consistency and to handle the case where messages load progressively.
const seenUserMessages = new Map<string, Message>();

function updateButtonToGeminiBookmarkedState(button: Element, iconContainer: HTMLElement): void {
  safeDOMOperation(() => {
    const geminiIcon = button.querySelector('span[style*="font-size"]');
    if (geminiIcon) {
      geminiIcon.textContent = '🔖';
    } else if (iconContainer) {
      iconContainer.textContent = '🔖';
    }
    button.setAttribute('aria-label', 'Bookmarked');
    button.setAttribute('title', 'Bookmarked');
    const actualButton = button.tagName === 'BUTTON' ? button : button.querySelector('button');
    if (actualButton) {
      (actualButton as HTMLButtonElement).style.cursor = 'default';
      // Update the scoped style tag to keep opacity: 1
      const uid = (actualButton as HTMLElement).getAttribute('data-bm-uid');
      if (uid) {
        const styleEl = document.querySelector(`style[data-bm-style="${uid}"]`);
        if (styleEl) {
          styleEl.textContent = `[data-bm-uid="${uid}"] { opacity: 1 !important; pointer-events: auto !important; }`;
        }
      }
      const newButton = actualButton.cloneNode(true) as HTMLElement;
      actualButton.parentNode?.replaceChild(newButton, actualButton);
    }
  }, 'Gemini Button Update');
}

function injectBookmarkButtons(platform: GeminiPlatform): void {
  safeExecute(() => {
    const messages = platform.getMessages();
    if (messages.length === 0) return;

    messages.filter(m => m.role === 'user').forEach(message => {
      try {
        seenUserMessages.set(message.id, message);

        if (message.element.querySelector('.bookmark-button')) return;

        const bookmark = getBookmark(message.id);
        platform.injectBookmarkButton(
          message,
          (msg) => safeExecuteAsync(
            () => handleBookmarkClick(
              msg,
              platform,
              updateButtonToGeminiBookmarkedState,
              undefined  // Gemini: no virtualization, no position needed
            ),
            'Gemini Bookmark Click'
          ),
          bookmark
        );

        message.element.setAttribute('data-bookmark-processed', 'true');
      } catch (error) {
        console.warn('⚠️ Failed to inject button for message:', message.id, error);
      }
    });
  }, 'Gemini Button Injection');
}

function updateSidebar(platform: GeminiPlatform, conversationId: string): void {
  const stableMessages = Array.from(seenUserMessages.values());
  // Gemini has no virtualization — getMessages() always returns all messages.
  // Use live count as it's always accurate.
  const totalCount = platform.getMessages().filter(m => m.role === 'user').length || seenUserMessages.size;

  injectSidebar(
    conversationId,
    (bookmark) => handleSidebarBookmarkClick(bookmark, currentPlatform),
    stableMessages,
    (messageId) => { if (currentPlatform) currentPlatform.scrollToMessage(messageId); },
    totalCount
  );
}

function setupMutationObserver(platform: GeminiPlatform, conversationId: string): void {
  safeExecute(() => {
    observer = new MutationObserver(safeMutationCallback(() => {
      if (injectionTimeout) clearTimeout(injectionTimeout);
      injectionTimeout = setTimeout(() => {
        injectBookmarkButtons(platform);
        updateSidebar(platform, conversationId);
      }, 800);
    }, 'Gemini MutationObserver'));

    const contentArea = document.querySelector('main') || document.body;
    observer.observe(contentArea, { childList: true, subtree: true });
  }, 'Gemini MutationObserver Setup');
}

async function initializeExtension(): Promise<void> {
  const platform = new GeminiPlatform();
  if (!platform.detectPlatform()) return;

  currentPlatform = platform;
  const conversationId = platform.getConversationId();

  await safeExecuteAsync(
    () => loadBookmarksForConversation(conversationId),
    'Gemini Load Bookmarks'
  );

  injectBookmarkButtons(platform);
  updateSidebar(platform, conversationId);

  if (seenUserMessages.size === 0) {
    let retryCount = 0;
    const maxRetries = 10;
    const retryIntervals = [500, 1000, 1000, 2000, 2000, 3000, 3000, 5000, 5000, 5000];
    const retry = () => {
      if (retryCount >= maxRetries) return;
      const delay = retryIntervals[retryCount++];
      setTimeout(() => {
        injectBookmarkButtons(platform);
        updateSidebar(platform, conversationId);
        if (seenUserMessages.size === 0) retry();
      }, delay);
    };
    retry();
  }

  setupMutationObserver(platform, conversationId);
}

function handleUrlChange(): void {
  safeExecute(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      seenUserMessages.clear();
      if (observer) { observer.disconnect(); observer = null; }
      setTimeout(() => {
        safeExecuteAsync(() => initializeExtension(), 'Gemini Re-initialization');
      }, 1000);
    }
  }, 'Gemini URL Change');
}

setInterval(() => safeExecute(handleUrlChange, 'Gemini URL Check'), 1000);
window.addEventListener('popstate', () => safeExecute(handleUrlChange, 'Gemini Popstate'));
setTimeout(() => safeExecuteAsync(() => initializeExtension(), 'Gemini Initialization Wrapper'), 1000);
window.addEventListener('beforeunload', () => safeExecute(() => {
  if (observer) observer.disconnect();
  if (injectionTimeout) clearTimeout(injectionTimeout);
}, 'Gemini Cleanup'));