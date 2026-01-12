import { GeminiPlatform } from '../platforms/gemini';
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

//console.log('🔖 AI Chat Bookmarks - Gemini loaded!');

// Setup global error handler first
setupGlobalErrorHandler('Gemini');

let currentPlatform: PlatformAdapter | null = null;
let observer: MutationObserver | null = null;
let injectionTimeout: NodeJS.Timeout | null = null;
let processedMessageIds = new Set<string>();
let lastUrl = window.location.href;

/**
 * Gemini-specific button update logic
 */
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
      
      const newButton = actualButton.cloneNode(true) as HTMLElement;
      actualButton.parentNode?.replaceChild(newButton, actualButton);
    }
  }, 'Gemini Button Update');
}

/**
 * Inject bookmark buttons - Gemini version
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
            () => handleBookmarkClick(msg, platform, updateButtonToGeminiBookmarkedState),
            'Gemini Bookmark Click'
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
  }, 'Gemini Button Injection', 0) || 0;
}

/**
 * Setup MutationObserver - Gemini version
 */
function setupMutationObserver(platform: PlatformAdapter): void {
  safeExecute(() => {
    observer = new MutationObserver(safeMutationCallback(() => {
      if (injectionTimeout) {
        clearTimeout(injectionTimeout);
      }
      
      injectionTimeout = setTimeout(() => {
        injectBookmarkButtons(platform);
      }, 800);
    }, 'Gemini MutationObserver'));
    
    const contentArea = document.querySelector('main') || document.body;
    
    observer.observe(contentArea, {
      childList: true,
      subtree: true
    });
    
    //console.log('👁️  MutationObserver active - watching for new messages');
  }, 'Gemini MutationObserver Setup');
}

/**
 * Initialize Gemini extension - ASYNC VERSION
 */
async function initializeExtension(): Promise<void> {
  const platform = new GeminiPlatform();
  
  if (!platform.detectPlatform()) {
    console.log('❌ Not on Gemini');
    return;
  }
  
  currentPlatform = platform;
  //console.log('✅ Gemini platform initialized');
  
  const conversationId = platform.getConversationId();
  //console.log(`📝 Conversation ID: ${conversationId}`);
  
  // LOAD BOOKMARKS FIRST
  await safeExecuteAsync(
    () => loadBookmarksForConversation(conversationId),
    'Gemini Load Bookmarks'
  );
  
  const attemptInjection = () => {
    const initialCount = injectBookmarkButtons(platform);
    const totalMessages = platform.getMessages().length;
    //console.log(`💬 Found ${totalMessages} messages, injected ${initialCount} buttons`);
    return totalMessages;
  };
  
  let totalMessages = attemptInjection();
  
  if (totalMessages === 0) {
    console.log('⏳ No messages found yet, setting up retry logic...');
    
    let retryCount = 0;
    const maxRetries = 10;
    const retryIntervals = [500, 1000, 1000, 2000, 2000, 3000, 3000, 5000, 5000, 5000];
    
    const retry = () => {
      if (retryCount >= maxRetries) {
       // console.log('⚠️ Gave up after 10 retries');
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
 * Handle URL changes - Gemini version
 */
function handleUrlChange(): void {
  safeExecute(() => {
    const currentUrl = window.location.href;
    
    if (currentUrl !== lastUrl) {
      console.log('🔄 URL changed, re-initializing...');
      lastUrl = currentUrl;
      
      processedMessageIds.clear();
      // DON'T clear bookmarkedMessageIds - loadBookmarksForConversation handles this
      
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      
      setTimeout(() => {
        safeExecuteAsync(
          () => initializeExtension(),
          'Gemini Re-initialization'
        );
      }, 1000);
    }
  }, 'Gemini URL Change');
}

// Watch for URL changes
setInterval(() => safeExecute(handleUrlChange, 'Gemini URL Check'), 1000);

window.addEventListener('popstate', () => {
  safeExecute(() => {
    //console.log('🔄 Browser navigation detected');
    handleUrlChange();
  }, 'Gemini Popstate');
});

// Initialize - USE ASYNC WRAPPER
setTimeout(() => {
  safeExecuteAsync(
    () => initializeExtension(),
    'Gemini Initialization Wrapper'
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
  }, 'Gemini Cleanup');
});