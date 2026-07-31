import { ClaudePlatform } from '../platforms/claude';
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

setupGlobalErrorHandler('Claude');

let currentPlatform: ClaudePlatform | null = null;
let observer: MutationObserver | null = null;
let injectionTimeout: NodeJS.Timeout | null = null;
let lastUrl = window.location.href;

const seenUserMessages = new Map<string, Message>();
const messagePosinset = new Map<string, number>(); // captured while element is in DOM

function updateButtonToClaudeBookmarkedState(button: Element, iconContainer: HTMLElement): void {
  safeDOMOperation(() => {
    iconContainer.textContent = '🔖';
    button.setAttribute('aria-label', 'Bookmarked');
    button.setAttribute('title', 'Bookmarked');
    (button as HTMLButtonElement).style.cursor = 'default';
    const newButton = button.cloneNode(true) as HTMLElement;
    button.parentNode?.replaceChild(newButton, button);
  }, 'Claude Button Update');
}

function injectBookmarkButtons(platform: ClaudePlatform): void {
  safeExecute(() => {
    const messages = platform.getMessages();
    if (messages.length === 0) return;

    messages.filter(m => m.role === 'user').forEach(message => {
      try {
        seenUserMessages.set(message.id, message);

        // Capture posinset while element is in DOM — used for messages tab navigation
        const posinset = platform.getMessagePosinset(message.element);
        if (posinset > 0) messagePosinset.set(message.id, posinset);

        if (bookmarkButtonExists(message.element)) return;

        const bookmark = getBookmark(message.id);

        platform.injectBookmarkButton(
          message,
          (msg) => {
            // Capture posinset NOW while element is in the DOM
            const posinset = platform.getMessagePosinset(msg.element);
            safeExecuteAsync(
              () => handleBookmarkClick(
                msg,
                platform,
                updateButtonToClaudeBookmarkedState,
                posinset > 0 ? { posinset } : undefined
              ),
              'Claude Bookmark Click'
            );
          },
          bookmark
        );

        message.element.setAttribute('data-bookmark-processed', 'true');
      } catch (error) {
        console.warn('⚠️ Failed to inject button for message:', message.id, error);
      }
    });
  }, 'Claude Button Injection');
}

function updateSidebar(platform: ClaudePlatform, conversationId: string): void {
  const stableMessages = Array.from(seenUserMessages.values());
  const totalUserCount = platform.getTotalUserMessageCount() || seenUserMessages.size;

  injectSidebar(
    conversationId,
    (bookmark) => {
      if (currentPlatform) {
        // Use posinset stored in bookmark — works across sessions
        currentPlatform.scrollToMessage(bookmark.messageId, bookmark.posinset);
      }
    },
    stableMessages,
    (messageId) => {
      if (currentPlatform) {
        // Use stored posinset — captured when element was in DOM, reliable across virtualization
        const posinset = messagePosinset.get(messageId);
        currentPlatform.scrollToMessage(messageId, posinset);
      }
    },
    totalUserCount
  );
}

function setupMutationObserver(platform: ClaudePlatform, conversationId: string): void {
  safeExecute(() => {
    observer = new MutationObserver(safeMutationCallback(() => {
      if (injectionTimeout) clearTimeout(injectionTimeout);
      injectionTimeout = setTimeout(() => {
        injectBookmarkButtons(platform);
        updateSidebar(platform, conversationId);
      }, 500);
    }, 'Claude MutationObserver'));

    const contentArea = document.querySelector('main') || document.body;
    observer.observe(contentArea, { childList: true, subtree: true });
  }, 'Claude MutationObserver Setup');
}

async function initializeExtension(): Promise<void> {
  const platform = new ClaudePlatform();
  if (!platform.detectPlatform()) return;

  currentPlatform = platform;
  const conversationId = platform.getConversationId();

  await safeExecuteAsync(
    () => loadBookmarksForConversation(conversationId),
    'Claude Load Bookmarks'
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
      messagePosinset.clear();
      if (observer) { observer.disconnect(); observer = null; }
      setTimeout(() => {
        safeExecuteAsync(() => initializeExtension(), 'Claude Re-initialization');
      }, 1000);
    }
  }, 'Claude URL Change');
}

setInterval(() => safeExecute(handleUrlChange, 'Claude URL Check'), 1000);
window.addEventListener('popstate', () => safeExecute(handleUrlChange, 'Claude Popstate'));
setTimeout(() => safeExecuteAsync(() => initializeExtension(), 'Claude Initialization Wrapper'), 1000);
window.addEventListener('beforeunload', () => safeExecute(() => {
  if (observer) observer.disconnect();
  if (injectionTimeout) clearTimeout(injectionTimeout);
}, 'Claude Cleanup'));