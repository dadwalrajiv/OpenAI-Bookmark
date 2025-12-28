import { BasePlatform } from './base';
import { Message } from '../types/platform';
import { Bookmark } from '../types/bookmark';  // ADD THIS with other imports

export class ClaudePlatform extends BasePlatform {
  name = 'claude';
  
  detectPlatform(): boolean {
    return window.location.hostname === 'claude.ai';
  }
  
  getMessages(): Message[] {
    //console.log('🔍 Scanning for Claude messages...');
    
    const userMessages = document.querySelectorAll('[data-testid="user-message"]');
    const assistantMessages = document.querySelectorAll('[data-test-render-count]');
    
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
      const contentDiv = htmlElement.querySelector('.font-claude-response');
      const targetElement = contentDiv || htmlElement;
      const text = this.extractText(targetElement as HTMLElement).trim();
      
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
  
  /**
   * Simple hash function for strings
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  getConversationId(): string {
    const match = window.location.pathname.match(/\/chat\/([^\/]+)/);
    return match ? match[1] : 'unknown';
  }
  
 injectBookmarkButton(message: Message, onClick: (message: Message) => void, bookmark: Bookmark | null): void {
  // Check if button already exists
  if (message.element.querySelector('.bookmark-button')) {
    return;
  }
  
  // The action bar is not directly on the message element
  // We need to traverse up the DOM tree to find it
  let searchElement: HTMLElement | null = message.element;
  let actionBar: HTMLElement | null = null;
  let attempts = 0;
  
  // Go up 5 levels max looking for the action bar
  while (searchElement && attempts < 5) {
    // Look in current element
    actionBar = searchElement.querySelector('[role="group"][aria-label="Message actions"]');
    if (actionBar) break;
    
    // Look in siblings
    let sibling = searchElement.nextElementSibling;
    while (sibling) {
      if (sibling.getAttribute('role') === 'group' && 
          sibling.getAttribute('aria-label') === 'Message actions') {
        actionBar = sibling as HTMLElement;
        break;
      }
      sibling = sibling.nextElementSibling;
    }
    
    if (actionBar) break;
    
    // Move up one level
    searchElement = searchElement.parentElement;
    attempts++;
  }
  
  if (!actionBar) {
    console.warn('Could not find action bar for message:', message.id);
    return;
  }
  
  // Find the button container
  const buttonContainer = actionBar.querySelector('.flex.items-center');
  
  const isBookmarked = bookmark !== null;  // CHANGED: derive from bookmark object
  
  if (!buttonContainer) {
    // Use the action bar itself as fallback
    this.createAndInsertButton(actionBar, onClick, message, isBookmarked, bookmark?.note);  // CHANGED: pass note
    return;
  }
  
  this.createAndInsertButton(buttonContainer, onClick, message, isBookmarked, bookmark?.note);  // CHANGED: pass note
}

private createAndInsertButton(
  container: Element, 
  onClick: (message: Message) => void, 
  message: Message,
  isBookmarked: boolean,
  bookmarkNote?: string  // ADD THIS PARAMETER
): void {
  const button = document.createElement('button');
  button.className = 'bookmark-button inline-flex items-center justify-center relative shrink-0 select-none border-transparent transition font-base duration-300 h-8 w-8 rounded-md active:scale-95 group';
  button.type = 'button';
  
  // Set different attributes based on bookmarked state
  if (isBookmarked) {
    button.setAttribute('aria-label', 'Bookmarked');
    button.setAttribute('title', bookmarkNote || 'Bookmarked');  // CHANGED: show note in tooltip
    button.style.cssText = 'cursor: default; opacity: 0.8;';
  } else {
    button.setAttribute('aria-label', 'Bookmark this message');
    button.setAttribute('title', 'Bookmark this message');
    button.style.cssText = 'cursor: pointer; opacity: 0.6; transition: opacity 0.2s;';
    
    // Only add hover effect if not bookmarked
    button.onmouseenter = () => {
      button.style.opacity = '1';
    };
    
    button.onmouseleave = () => {
      button.style.opacity = '0.6';
    };
    
    // Only add click handler if not bookmarked
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(message);
    });
  }
  
  const iconContainer = document.createElement('div');
  iconContainer.className = 'flex items-center justify-center';
  iconContainer.style.cssText = 'width: 20px; height: 20px; font-size: 16px;';
  iconContainer.textContent = isBookmarked ? '🔖' : '📌';
  
  button.appendChild(iconContainer);
  container.insertBefore(button, container.firstChild);
}
  
 scrollToMessage(messageId: string): void {
  //console.log('📜 Scrolling to message:', messageId);
  
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
  
  if (!messageElement) {
    console.warn('⚠️  Message not found in current view');
    alert('⚠️ Message Not Found\n\nThis message may be from an earlier part of the conversation that is no longer loaded.\n\nTip: Scroll up to load older messages, then try clicking the bookmark again.');
    return;
  }
  
  // Simple approach: scroll element into view with margin
  messageElement.style.scrollMarginTop = '100px';
  
  messageElement.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
  
  this.highlightElement(messageElement);
}
  private highlightElement(element: HTMLElement): void {
    // Store original styles
    const originalBackground = element.style.backgroundColor;
    const originalTransition = element.style.transition;
    
    // Apply highlight
    element.style.transition = 'background-color 0.3s ease';
    element.style.backgroundColor = 'rgba(255, 255, 0, 0.2)'; // Yellow highlight
    
    // Remove highlight after 2 seconds
    setTimeout(() => {
      element.style.backgroundColor = originalBackground;
      
      // Restore original transition after animation
      setTimeout(() => {
        element.style.transition = originalTransition;
      }, 300);
    }, 2000);
  }
}