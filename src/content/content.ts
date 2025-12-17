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
let bookmarkedMessageIds = new Set<string>();
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
  
  // Add to tracked set
  bookmarkedMessageIds.add(message.id);
  
  // Find the bookmark button - platform-specific search
  let button: Element | null = null;
  
  // Try direct child first
  button = message.element.querySelector('.bookmark-button');
  
  if (!button) {
    // For ChatGPT/Claude: search in parent/ancestor containers
    let searchElement: HTMLElement | null = message.element;
    let attempts = 0;
    
    // Go up 10 levels max
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
    // Find the icon container
    let iconContainer: HTMLElement | null = button.querySelector('div');
    if (!iconContainer) {
      iconContainer = button.querySelector('span span');
    }
    if (!iconContainer) {
      iconContainer = button.querySelector('span');
    }
    
    if (iconContainer) {
      // Change icon immediately
      iconContainer.textContent = '🔖';
      
      // Update attributes
      button.setAttribute('aria-label', 'Bookmarked');
      button.setAttribute('title', 'Bookmarked');
      
      // Make non-clickable
      (button as HTMLButtonElement).style.cursor = 'default';
      (button as HTMLButtonElement).style.opacity = '0.8';
      
      // Remove all event listeners by cloning and replacing
      const newButton = button.cloneNode(true) as HTMLElement;
      button.parentNode?.replaceChild(newButton, button);
      
      console.log('✅ Button updated to bookmarked state');
    } else {
      console.warn('⚠️ Could not find icon container to update');
    }
  } else {
    console.warn('⚠️ Could not find bookmark button after searching 10 levels up');
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
  console.log('📍 Looking for message with ID:', bookmark.messageId);
  
  if (!currentPlatform) {
    console.warn('⚠️  Platform not initialized');
    return;
  }
  
  // Debug: Show all current message IDs in DOM
  const allMessageElements = document.querySelectorAll('[data-message-id]');
  console.log(`🔍 Total messages with IDs in DOM: ${allMessageElements.length}`);
  allMessageElements.forEach((el, idx) => {
    const id = el.getAttribute('data-message-id');
    console.log(`  ${idx + 1}. ${id}`);
  });
  
  currentPlatform.scrollToMessage(bookmark.messageId);
}

function injectBookmarkButtons(platform: PlatformAdapter) {
  const messages = platform.getMessages();
  
  if (messages.length === 0) {
    return 0;
  }
  
  let injectedCount = 0;
  messages.forEach(message => {
    // ONLY inject on user messages (not assistant)
    if (message.role !== 'user') {
      return;
    }
    
    const alreadyProcessed = processedMessageIds.has(message.id);
    const buttonExists = message.element.querySelector('.bookmark-button') !== null;
    
    if (alreadyProcessed || buttonExists) {
      if (!alreadyProcessed) {
        processedMessageIds.add(message.id);
      }
      return;
    }
    
    // Check if this message is already bookmarked
    const isBookmarked = bookmarkedMessageIds.has(message.id);
    
    platform.injectBookmarkButton(message, handleBookmarkClick, isBookmarked);  // PASS isBookmarked
    processedMessageIds.add(message.id);
    injectedCount++;
  });
  
  if (injectedCount > 0) {
    console.log(`📌 Injected ${injectedCount} new bookmark buttons`);
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
    console.log(`📖 Found ${bookmarks.length} existing bookmarks for this conversation`);
    
    // Store bookmarked message IDs in Set for quick lookup
    bookmarkedMessageIds.clear();
    bookmarks.forEach(bookmark => {
      bookmarkedMessageIds.add(bookmark.messageId);
    });
    
    console.log(`🔖 Tracking ${bookmarkedMessageIds.size} bookmarked messages`);
    
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