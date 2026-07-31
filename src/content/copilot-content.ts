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

let currentPlatform: PlatformAdapter | null = null;
let observer: MutationObserver | null = null;
let injectionTimeout: NodeJS.Timeout | null = null;
let lastUrl = window.location.href;

let processedMessageIds = new Set<string>();
const seenUserMessages = new Map<string, Message>();

function updateButtonToGeminiBookmarkedState(button: Element, iconContainer: HTMLElement): void {
  safeDOMOperation(() => {
    const geminiIcon = button.querySelector('span[style*="font-size"]');
    if (geminiIcon) { geminiIcon.textContent = '🔖'; } else if (iconContainer) { iconContainer.textContent = '🔖'; }
    button.setAttribute('aria-label', 'Bookmarked');
    button.setAttribute('title', 'Bookmarked');
    const actualButton = button.tagName === 'BUTTON' ? button : button.querySelector('button');
    if (actualButton) {
      (actualButton as HTMLButtonElement).style.cursor = 'default';
      const newButton = actualButton.cloneNode(true) as HTMLElement;
      actualButton.parentNode?.replaceChild(newButton, actualButton);
    }
  }, 'Gemini Button Update');
}

function injectBookmarkButtons(platform: PlatformAdapter): void {
  safeExecute(() => {
    const messages = platform.getMessages();
    if (messages.length === 0) return;

    messages.filter(m => m.role === 'user').forEach(message => {
      try {
        seenUserMessages.set(message.id, message);

        if (message.element.querySelector('.bookmark-button')) {
          processedMessageIds.add(message.id);
          return;
        }

        const bookmark = getBookmark(message.id);
        platform.injectBookmarkButton(
          message,
          (msg) => safeExecuteAsync(
            () => handleBookmarkClick(msg, platform, updateButtonToGeminiBookmarkedState),
            'Gemini Bookmark Click'
          ),
          bookmark
        );

        message.element.setAttribute('data-bookmark-processed', 'true');
        processedMessageIds.add(message.id);
      } catch (error) {
        console.warn('⚠️ Failed to inject button for message:', message.id, error);
      }
    });
  }, 'Gemini Button Injection');
}

function updateSidebar(conversationId: string): void {
  const stableMessages = Array.from(seenUserMessages.values());
  injectSidebar(
    conversationId,
    (bookmark) => handleSidebarBookmarkClick(bookmark, currentPlatform),
    stableMessages,
    (messageId) => { if (currentPlatform) currentPlatform.scrollToMessage(messageId); },
    processedMessageIds.size
  );
}

function setupMutationObserver(platform: PlatformAdapter, conversationId: string): void {
  safeExecute(() => {
    observer = new MutationObserver(safeMutationCallback(() => {
      if (injectionTimeout) clearTimeout(injectionTimeout);
      injectionTimeout = setTimeout(() => {
        injectBookmarkButtons(platform);
        updateSidebar(conversationId);
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
  updateSidebar(conversationId);

  if (processedMessageIds.size === 0) {
    let retryCount = 0;
    const maxRetries = 10;
    const retryIntervals = [500, 1000, 1000, 2000, 2000, 3000, 3000, 5000, 5000, 5000];
    const retry = () => {
      if (retryCount >= maxRetries) return;
      const delay = retryIntervals[retryCount++];
      setTimeout(() => {
        injectBookmarkButtons(platform);
        updateSidebar(conversationId);
        if (processedMessageIds.size === 0) retry();
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
      processedMessageIds.clear();
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