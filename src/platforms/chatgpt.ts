import { BasePlatform } from './base';
import { Message } from '../types/platform';
import { Bookmark } from '../types/bookmark';

export class ChatGPTPlatform extends BasePlatform {
  name = 'chatgpt';
  
  detectPlatform(): boolean {
    const hostname = window.location.hostname;
    return hostname === 'chatgpt.com' || hostname === 'chat.openai.com';
  }
  
  getMessages(): Message[] {
    //console.log('🔍 Scanning for ChatGPT messages...');
    
    // Both user and assistant messages have data-message-author-role attribute
    const userMessages = document.querySelectorAll('[data-message-author-role="user"]');
    const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
    
    //console.log(`Found ${userMessages.length} user messages, ${assistantMessages.length} assistant messages`);
    
    const messages: Message[] = [];
    
    // Process user messages
    userMessages.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      const text = this.extractText(htmlElement).trim();
      
      if (text.length > 0) {
        // Check if element already has our stable ID
        let messageId = htmlElement.getAttribute('data-message-id');
        
        // Only generate new ID if element doesn't have one
        if (!messageId) {
          messageId = this.generateStableMessageId('user', text);
          htmlElement.setAttribute('data-message-id', messageId);
          console.log(`🆕 Generated new ID for user message: ${messageId}`);
        }
        
        const message: Message = {
          id: messageId,
          element: htmlElement,
          text: text,
          role: 'user',
          timestamp: Date.now()
        };
        
        messages.push(message);
      }
    });
    
    // Process assistant messages
    assistantMessages.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      const text = this.extractText(htmlElement).trim();
      
      if (text.length > 10) {
        // Check if element already has our stable ID
        let messageId = htmlElement.getAttribute('data-message-id');
        
        // Only generate new ID if element doesn't have one
        if (!messageId) {
          messageId = this.generateStableMessageId('assistant', text);
          htmlElement.setAttribute('data-message-id', messageId);
          console.log(`🆕 Generated new ID for assistant message: ${messageId}`);
        }
        
        const message: Message = {
          id: messageId,
          element: htmlElement,
          text: text,
          role: 'assistant',
          timestamp: Date.now()
        };
        
        messages.push(message);
      }
    });
    
    messages.sort((a, b) => {
      const rectA = a.element.getBoundingClientRect();
      const rectB = b.element.getBoundingClientRect();
      return rectA.top - rectB.top;
    });
    
    //console.log(`✅ Successfully parsed ${messages.length} messages total`);
    return messages;
  }
  
  /**
   * Generate a truly stable message ID based ONLY on content
   * No index - IDs remain the same regardless of message position
   */
  private generateStableMessageId(role: string, text: string): string {
    // Use first 300 chars for better uniqueness (was 100)
    const contentSample = text.substring(0, 300);
    const contentHash = this.simpleHash(contentSample);
    
    // Add first 20 chars (alphanumeric only) as extra uniqueness
    const prefix = text.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    // Format: role_prefix_hash
    return `${role}_${prefix}_${contentHash}`;
  }
  
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
  
  getConversationId(): string {
    const match = window.location.pathname.match(/\/c\/([^\/]+)/);
    return match ? match[1] : 'chatgpt_' + Date.now();
  }
  
 injectBookmarkButton(message: Message, onClick: (message: Message) => void, bookmark: Bookmark | null): void {
  if (message.element.querySelector('.bookmark-button')) {
    return;
  }
  
  // ChatGPT structure: message is inside a turn container
  // Action bar is a sibling with buttons
  const turnContainer = message.element.closest('[tabindex="-1"]');
  if (!turnContainer) {
    //console.warn('❌ No turn container found');
    return;
  }
  
  // Find all divs in turn container
  const allDivs = turnContainer.querySelectorAll('div');
  let actionBar: HTMLElement | null = null;
  
  for (let index = 0; index < allDivs.length; index++) {
    const div = allDivs[index] as HTMLElement;
    const hasButtons = div.querySelectorAll('button').length > 0;
    
    if (hasButtons) {
      const hasCopyButton = div.querySelector('[aria-label*="Copy"]');
      if (hasCopyButton && !actionBar) {
        actionBar = div;
        break;
      }
    }
  }
  
  if (!actionBar) {
    //console.warn('❌ Could not find action bar');
    return;
  }
  
  const button = document.createElement('button');
  button.className = 'bookmark-button text-token-text-secondary hover:bg-token-bg-secondary rounded-lg';
  button.type = 'button';
  
  const isBookmarked = bookmark !== null;  // CHANGED: derive from bookmark object
  
  // Set different attributes based on bookmarked state
  if (isBookmarked) {
    button.setAttribute('aria-label', 'Bookmarked');
    button.setAttribute('title', bookmark.note || 'Bookmarked');  // CHANGED: show note in tooltip
    button.style.cssText = 'cursor: default;';
  } else {
    button.setAttribute('aria-label', 'Bookmark this message');
    button.setAttribute('title', 'Bookmark this message');
    button.style.cssText = 'cursor: pointer;';
    
    // Only add click handler if not bookmarked
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(message);
    });
  }
  
  const span = document.createElement('span');
  span.className = 'flex items-center justify-center touch:w-10 h-8 w-8';
  
  const iconText = document.createElement('span');
  iconText.textContent = isBookmarked ? '🔖' : '📌';
  iconText.style.cssText = 'font-size: 16px;';
  
  span.appendChild(iconText);
  button.appendChild(span);
  
  // Insert before first button in action bar
  const firstButton = actionBar.querySelector('button');
  
  if (firstButton && firstButton.parentElement) {
    firstButton.parentElement.insertBefore(button, firstButton);
  } else {
    //console.warn('❌ Could not find first button');
  }
}
  
 scrollToMessage(messageId: string): void {
  //console.log('📜 Scrolling to message:', messageId);
  
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  
  if (!messageElement) {
    console.warn('⚠️  Message not found in current view');
    alert('⚠️ Message Not Found\n\nThis message may be from an earlier part of the conversation that is no longer loaded.\n\nTip: Scroll up to load older messages, then try clicking the bookmark again.');
    return;
  }
  
  // Find the scrollable container (ChatGPT uses a custom scroll container)
  const scrollContainer = messageElement.closest('[class*="overflow"]') as HTMLElement;
  
  if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
    // Use the scroll container
    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = messageElement.getBoundingClientRect();
    const relativeTop = elementRect.top - containerRect.top;
    
    scrollContainer.scrollTo({
      top: scrollContainer.scrollTop + relativeTop - 100,
      behavior: 'smooth'
    });
  } else {
    // Fallback to simple scrollIntoView
    messageElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
  
  this.highlightElement(messageElement as HTMLElement);
}
  private highlightElement(element: HTMLElement): void {
    const originalBackground = element.style.backgroundColor;
    const originalTransition = element.style.transition;
    
    element.style.transition = 'background-color 0.3s ease';
    element.style.backgroundColor = 'rgba(255, 255, 0, 0.2)';
    
    setTimeout(() => {
      element.style.backgroundColor = originalBackground;
      
      setTimeout(() => {
        element.style.transition = originalTransition;
      }, 300);
    }, 2000);
  }
}