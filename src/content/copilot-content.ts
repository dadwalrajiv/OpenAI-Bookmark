import { CopilotPlatform } from '../platforms/copilot';
import { PlatformAdapter, Message } from '../types/platform';
import { injectSidebar } from '../sidebar/index';
import {
  handleBookmarkClick,
  handleSidebarBookmarkClick,
  loadBookmarksForConversation,
  bookmarkedMessageIds,
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

//console.log('🔖 AI Chat Bookmarks - Copilot loaded!');

// Setup global error handler first
setupGlobalErrorHandler('Copilot');

let currentPlatform: PlatformAdapter | null = null;
let observer: MutationObserver | null = null;
let injectionTimeout: NodeJS.Timeout | null = null;
let processedMessageIds = new Set<string>();
let lastUrl = window.location.href;

/**
 * Copilot-specific button update logic
 */
function updateButtonToCopilotBookmarkedState(button: Element, iconContainer: HTMLElement): void {
  safeDOMOperation(() => {
    const icon = button.querySelector('span');
    if (icon) {
      icon.textContent = '🔖';
    } else if (iconContainer) {
      iconContainer.textContent = '🔖';
    }
    
    button.setAttribute('aria-label', 'Bookmarked');
    button.setAttribute('title', 'Bookmarked');
    
    (button as HTMLButtonElement).style.cursor = 'default';
    (button as HTMLButtonElement).style.opacity = '0.6';
    
    const newButton = button.cloneNode(true) as HTMLElement;
    button.parentNode?.replaceChild(newButton, button);
  }, 'Copilot Button Update');
}

/**
 * Inject bookmark buttons - Copilot version
 */
function injectBookmarkButtons(platform: PlatformAdapter): number {
  return safeExecute(() => {
    const messages = platform.getMessages();
    
    if (messages.length === 0) {
      return 0;
    }
    
    let injectedCount = 0;
    
    messages.forEach(message => {
      try {
        if (message.role !== 'user') {
          return;
        }
        
        if (bookmarkButtonExists(message.element)) {
          if (!processedMessageIds.has(message.id)) {
            processedMessageIds.add(message.id);
          }
          return;
        }
        
        const bookmark = getBookmark(message.id);
        
        platform.injectBookmarkButton(
          message,
          (msg) => safeExecuteAsync(
            () => handleBookmarkClick(msg, platform, updateButtonToCopilotBookmarkedState),
            'Copilot Bookmark Click'
          ),
          bookmark
        );
         
        // ✅ MARK MESSAGE AS PROCESSED - prevents duplicate injection
        message.element.setAttribute('data-bookmark-processed', 'true');
        
        processedMessageIds.add(message.id);
        injectedCount++;
      } catch (error) {
        console.warn('⚠️  Failed to inject button for message:', message.id, error);
      }
    });
    
    if (injectedCount > 0) {
      //console.log(`📌 Injected ${injectedCount} new bookmark buttons`);
    }
    
    return injectedCount;
  }, 'Copilot Button Injection', 0) || 0;
}

/**
 * Setup MutationObserver - Copilot version
 */
function setupMutationObserver(platform: PlatformAdapter): void {
  safeExecute(() => {
    observer = new MutationObserver(safeMutationCallback(() => {
      if (injectionTimeout) {
        clearTimeout(injectionTimeout);
      }
      
      injectionTimeout = setTimeout(() => {
        injectBookmarkButtons(platform);
      }, 500);
    }, 'Copilot MutationObserver'));
    
    const contentArea = document.querySelector('main') || document.body;
    
    observer.observe(contentArea, {
      childList: true,
      subtree: true
    });
    
    console.log('👁️  MutationObserver active - watching for new messages');
  }, 'Copilot MutationObserver Setup');
}

/**
 * Initialize Copilot extension - ASYNC VERSION
 */
async function initializeExtension(): Promise<void> {
  const platform = new CopilotPlatform();
  
  if (!platform.detectPlatform()) {
    console.log('❌ Not on Copilot');
    return;
  }
  
  currentPlatform = platform;
  //console.log('✅ Copilot platform initialized');
  
  const conversationId = platform.getConversationId();
  //console.log(`📝 Conversation ID: ${conversationId}`);
  
  // LOAD BOOKMARKS FIRST
  await safeExecuteAsync(
    () => loadBookmarksForConversation(conversationId),
    'Copilot Load Bookmarks'
  );
  
  const attemptInjection = () => {
    const initialCount = injectBookmarkButtons(platform);
    const totalMessages = platform.getMessages().length;
    //console.log(`💬 Found ${totalMessages} messages, injected ${initialCount} buttons`);
    return totalMessages;
  };
  
  let totalMessages = attemptInjection();
  
  if (totalMessages === 0) {
    //console.log('⏳ No messages found yet, setting up retry logic...');
    
    let retryCount = 0;
    const maxRetries = 10;
    const retryIntervals = [500, 1000, 1000, 2000, 2000, 3000, 3000, 5000, 5000, 5000];
    
    const retry = () => {
      if (retryCount >= maxRetries) {
        //console.log('⚠️ Gave up after 10 retries');
        return;
      }
      
      const delay = retryIntervals[retryCount];
      retryCount++;
      
      setTimeout(() => {
        //console.log(`🔄 Retry ${retryCount}/${maxRetries}`);
        totalMessages = attemptInjection();
        
        if (totalMessages > 0) {
          //console.log(`✅ Success! Found ${totalMessages} messages`);
        } else {
          retry();
        }
      }, delay);
    };
    
    retry();
  }
  
  setupMutationObserver(platform);
  
  injectSidebar(conversationId, (bookmark) =>
    handleSidebarBookmarkClick(bookmark, currentPlatform)
  );
}

/**
 * Handle URL changes
 */
function handleUrlChange(): void {
  safeExecute(() => {
    const currentUrl = window.location.href;
    
    if (currentUrl !== lastUrl) {
     // console.log('🔄 URL changed, re-initializing...');
      lastUrl = currentUrl;
      
      processedMessageIds.clear();
      //bookmarkedMessageIds.clear();
      
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      
      setTimeout(() => {
        safeExecuteAsync(
          () => initializeExtension(),
          'Copilot Re-initialization'
        );
      }, 1000);
    }
  }, 'Copilot URL Change');
}

// Watch for URL changes
setInterval(() => safeExecute(handleUrlChange, 'Copilot URL Check'), 1000);

window.addEventListener('popstate', () => {
  safeExecute(() => {
    //console.log('🔄 Browser navigation detected');
    handleUrlChange();
  }, 'Copilot Popstate');
});

// Initialize - USE ASYNC WRAPPER
setTimeout(() => {
  safeExecuteAsync(
    () => initializeExtension(),
    'Copilot Initialization Wrapper'
  );
}, 1000);

// Cleanup
window.addEventListener('beforeunload', () => {
  safeExecute(() => {
    if (observer) {
      observer.disconnect();
    }
    if (injectionTimeout) {
      clearTimeout(injectionTimeout);
    }
  }, 'Copilot Cleanup');
});