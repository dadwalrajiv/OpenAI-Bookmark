import { PlatformDetector } from '../utils/platform-detector';
import { ClaudePlatform } from '../platforms/claude';
import { ChatGPTPlatform } from '../platforms/chatgpt';
import { PlatformAdapter } from '../types/platform';
import { Message } from '../types/platform';
import { Bookmark } from '../types/bookmark';
import { BookmarkStorage } from '../utils/storage';
import { InputSanitizer } from '../utils/sanitizer';
import { injectSidebar } from '../sidebar/index';

console.log('🔖 AI Chat Bookmarks extension loaded!');

let currentPlatform: PlatformAdapter | null = null;
let observer: MutationObserver | null = null;
let injectionTimeout: NodeJS.Timeout | null = null;
let processedMessageIds = new Set<string>(); // Track which messages we've already processed
let lastUrl = window.location.href;

async function handleBookmarkClick(message: Message) {
  console.log('🎯 Bookmark clicked!');
  
  if (!currentPlatform) {
    console.error('❌ Platform not initialized');
    return;
  }
  
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
    
    const button = message.element.querySelector('.bookmark-button');
    if (button) {
      const iconContainer = button.querySelector('span span');
      if (iconContainer) {
        iconContainer.textContent = '✅';
        
        setTimeout(() => {
          iconContainer.textContent = '📌';
        }, 2000);
      }
    }
    
    console.log('✅ Bookmark saved successfully!');
    
    window.dispatchEvent(new CustomEvent('bookmarkAdded', { detail: bookmark }));
    
  } catch (error) {
    console.error('❌ Error saving bookmark:', error);
    alert('Failed to save bookmark. Please try again.');
  }
}

function handleSidebarBookmarkClick(bookmark: Bookmark) {
  console.log('🎯 Sidebar bookmark clicked:', bookmark.id);
  
  if (!currentPlatform) {
    console.warn('⚠️  Platform not initialized');
    return;
  }
  
  currentPlatform.scrollToMessage(bookmark.messageId);
}

function injectBookmarkButtons(platform: PlatformAdapter) {
  const messages = platform.getMessages();
  
  if (messages.length === 0) {
    return 0;
  }
  
  let injectedCount = 0;
  messages.forEach(message => {
    // Skip if we've already processed this message
    if (processedMessageIds.has(message.id)) {
      return;
    }
    
    // Check if button already exists in DOM
    if (!message.element.querySelector('.bookmark-button')) {
      platform.injectBookmarkButton(message, handleBookmarkClick);
      processedMessageIds.add(message.id);
      injectedCount++;
    } else {
      // Button exists, mark as processed
      processedMessageIds.add(message.id);
    }
  });
  
  if (injectedCount > 0) {
    console.log(`📌 Injected ${injectedCount} new bookmark buttons (total tracked: ${processedMessageIds.size})`);
  }
  
  return injectedCount;
}

function setupMutationObserver(platform: PlatformAdapter) {
  observer = new MutationObserver((mutations) => {
    // Clear existing timeout
    if (injectionTimeout) {
      clearTimeout(injectionTimeout);
    }
    
    // Debounce: only inject after DOM has been stable for 500ms
    injectionTimeout = setTimeout(() => {
      injectBookmarkButtons(platform);
    }, 500);
  });
  
  // Observe only the main content area, not entire body (better performance)
  const contentArea = document.querySelector('main') || document.body;
  
  observer.observe(contentArea, {
    childList: true,
    subtree: true
  });
  
  console.log('👁️  MutationObserver active - watching for new messages');
}

function initializeExtension() {
  const platformType = PlatformDetector.detect();
  console.log(`🎯 Detected platform: ${platformType}`);  // Fixed: added ()
  
  let platform: PlatformAdapter | null = null;

  switch (platformType) {
    case 'claude':
      platform = new ClaudePlatform();
      break;
    case 'chatgpt':
      platform = new ChatGPTPlatform();
      break;
    default:
      console.log('❌ Unsupported platform');
      return;
  }

  if (platform && platform.detectPlatform()) {
    currentPlatform = platform;
    
    console.log(`✅ ${platform.name} platform initialized`);  // Fixed: added ()
    
    const conversationId = platform.getConversationId();
    console.log(`📝 Conversation ID: ${conversationId}`);  // Fixed: added ()
    
    // Function to attempt injection
    const attemptInjection = () => {
      const initialCount = injectBookmarkButtons(platform!);
      const totalMessages = platform!.getMessages().length;
      console.log(`💬 Found ${totalMessages} messages, injected ${initialCount} buttons`);  // Fixed: added ()
      return totalMessages;
    };
    
    // Try initial injection
    let totalMessages = attemptInjection();
    
    // If no messages found, retry with backoff
    if (totalMessages === 0) {
      console.log('⏳ No messages found yet, setting up retry logic...');
      
      let retryCount = 0;
      const maxRetries = 10;
      const retryIntervals = [500, 1000, 1000, 2000, 2000, 3000, 3000, 5000, 5000, 5000];
      
      const retry = () => {
        if (retryCount >= maxRetries) {
          console.log('⚠️ Gave up after 10 retries - page might be loading slowly');
          return;
        }
        
        const delay = retryIntervals[retryCount];
        retryCount++;
        
        setTimeout(() => {
          console.log(`🔄 Retry ${retryCount}/${maxRetries} (after ${delay}ms delay)...`);  // Fixed: added ()
          totalMessages = attemptInjection();
          
          if (totalMessages > 0) {
            console.log(`✅ Success! Found ${totalMessages} messages after ${retryCount} retries`);  // Fixed: added ()
          } else {
            retry();
          }
        }, delay);
      };
      
      retry();
    }
    
    // Setup mutation observer to catch future messages
    setupMutationObserver(platform);
    
    // Inject sidebar
    injectSidebar(conversationId, handleSidebarBookmarkClick);
    
    // Load existing bookmarks
    loadBookmarksForConversation(conversationId);
  } else {
    console.log('❌ Platform initialization failed');
  }
}

function handleUrlChange() {
  const currentUrl = window.location.href;
  
  if (currentUrl !== lastUrl) {
    console.log('🔄 URL changed, re-initializing...');
    lastUrl = currentUrl;
    
    // Clear processed messages for new conversation
    processedMessageIds.clear();
    
    // Re-initialize extension
    setTimeout(() => {
      initializeExtension();
    }, 1000);
  }
}

async function loadBookmarksForConversation(conversationId: string) {
  try {
    const bookmarks = await BookmarkStorage.getByConversation(conversationId);
    console.log(`📖 Loaded ${bookmarks.length} bookmarks for conversation: ${conversationId}`);
    
    if (bookmarks.length > 0) {
      console.log('Bookmark details:');
      bookmarks.forEach((bookmark, index) => {
        console.log(`  ${index + 1}. [${bookmark.platform}] "${bookmark.note || 'No note'}" - ${new Date(bookmark.timestamp).toLocaleString()}`);
      });
    }
  } catch (error) {
    console.error('❌ Error loading bookmarks:', error);
  }
}

// Add this before the final setTimeout at the bottom
// Watch for URL changes (for navigation between chats)
setInterval(handleUrlChange, 1000);

// Also watch for popstate (back/forward navigation)
window.addEventListener('popstate', () => {
  console.log('🔄 Browser navigation detected');
  handleUrlChange();
});
// Initialize after a short delay to let page load
setTimeout(() => {
  initializeExtension();
}, 1000);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (observer) {
    observer.disconnect();
  }
  if (injectionTimeout) {
    clearTimeout(injectionTimeout);
  }
});