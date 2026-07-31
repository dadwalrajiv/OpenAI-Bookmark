import { ChatGPTPlatform } from '../platforms/chatgpt';
import { PlatformAdapter, Message } from '../types/platform';
import { injectSidebar } from '../sidebar/index';
import {
  handleBookmarkClick,
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

setupGlobalErrorHandler('ChatGPT');

let currentPlatform: ChatGPTPlatform | null = null;
let observer: MutationObserver | null = null;
let injectionTimeout: NodeJS.Timeout | null = null;
let lastUrl = window.location.href;

// Grow-only stores
const seenUserMessages = new Map<string, Message>();
const messageTurnNumber = new Map<string, number>();

function updateButtonToChatGPTBookmarkedState(button: Element, iconContainer: HTMLElement): void {
  safeDOMOperation(() => {
    iconContainer.textContent = '🔖';
    button.setAttribute('aria-label', 'Bookmarked');
    button.setAttribute('title', 'Bookmarked');
    (button as HTMLButtonElement).style.cursor = 'default';
    const uid = (button as HTMLElement).getAttribute('data-bm-uid');
    if (uid) {
      const styleEl = document.querySelector(`style[data-bm-style="${uid}"]`);
      if (styleEl) {
        styleEl.textContent = `[data-bm-uid="${uid}"] { opacity: 1 !important; pointer-events: auto !important; }`;
      }
    }
    const newButton = button.cloneNode(true) as HTMLElement;
    button.parentNode?.replaceChild(newButton, button);
  }, 'ChatGPT Button Update');
}

function injectBookmarkButtons(platform: ChatGPTPlatform): void {
  safeExecute(() => {
    const messages = platform.getMessages();
    if (messages.length === 0) return;

    messages.filter(m => m.role === 'user').forEach(message => {
      try {
        // Always register in grow-only stores
        seenUserMessages.set(message.id, message);
        const turnNumber = platform.getTurnNumber(message.element);
        if (turnNumber > 0) messageTurnNumber.set(message.id, turnNumber);

        if (bookmarkButtonExists(message.element)) return;

        const bookmark = getBookmark(message.id);
        platform.injectBookmarkButton(
          message,
          (msg) => {
            const tn = platform.getTurnNumber(msg.element);
            safeExecuteAsync(
              () => handleBookmarkClick(
                msg,
                platform,
                updateButtonToChatGPTBookmarkedState,
                tn > 0 ? { turnNumber: tn } : undefined
              ),
              'ChatGPT Bookmark Click'
            );
          },
          bookmark
        );

        message.element.setAttribute('data-bookmark-processed', 'true');
      } catch (error) {
        console.warn('⚠️ Failed to inject button:', message.id, error);
      }
    });
  }, 'ChatGPT Button Injection');
}

function updateSidebar(platform: ChatGPTPlatform, conversationId: string): void {
  const stableMessages = Array.from(seenUserMessages.values());
  const maxTurn = platform.getMaxTurnNumber();
  const totalUserCount = maxTurn > 0 ? Math.ceil(maxTurn / 2) : seenUserMessages.size;

  injectSidebar(
    conversationId,
    (bookmark) => {
      if (currentPlatform) {
        currentPlatform.scrollToMessage(bookmark.messageId, bookmark.turnNumber);
      }
    },
    stableMessages,
    (messageId) => {
      if (currentPlatform) {
        const turnNumber = messageTurnNumber.get(messageId);
        currentPlatform.scrollToMessage(messageId, turnNumber);
      }
    },
    totalUserCount
  );
}

function setupMutationObserver(platform: ChatGPTPlatform, conversationId: string): void {
  safeExecute(() => {
    // MutationObserver for new messages being typed/sent
    observer = new MutationObserver(safeMutationCallback(() => {
      if (injectionTimeout) clearTimeout(injectionTimeout);
      injectionTimeout = setTimeout(() => {
        injectBookmarkButtons(platform);
        updateSidebar(platform, conversationId);
      }, 500);
    }, 'ChatGPT MutationObserver'));

    const contentArea = document.querySelector('main') || document.body;
    observer.observe(contentArea, { childList: true, subtree: true });

    // Scroll listener — ChatGPT virtualizes on user scroll only
    // Collect newly visible messages as user scrolls
    let scrollTimeout: NodeJS.Timeout | null = null;
    document.addEventListener('scroll', () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        injectBookmarkButtons(platform);
        updateSidebar(platform, conversationId);
      }, 300);
    }, { passive: true, capture: true });

  }, 'ChatGPT MutationObserver Setup');
}

async function initializeExtension(): Promise<void> {
  const platform = new ChatGPTPlatform();
  if (!platform.detectPlatform()) return;

  currentPlatform = platform;
  const conversationId = platform.getConversationId();

  await safeExecuteAsync(
    () => loadBookmarksForConversation(conversationId),
    'ChatGPT Load Bookmarks'
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
      messageTurnNumber.clear();
      setTimeout(() => {
        safeExecuteAsync(() => initializeExtension(), 'ChatGPT Re-initialization');
      }, 1000);
    }
  }, 'ChatGPT URL Change');
}

setInterval(() => safeExecute(handleUrlChange, 'ChatGPT URL Check'), 1000);
window.addEventListener('popstate', () => safeExecute(handleUrlChange, 'ChatGPT Popstate'));
setTimeout(() => safeExecuteAsync(() => initializeExtension(), 'ChatGPT Initialization Wrapper'), 1000);
window.addEventListener('beforeunload', () => safeExecute(() => {
  if (observer) observer.disconnect();
  if (injectionTimeout) clearTimeout(injectionTimeout);
}, 'ChatGPT Cleanup'));