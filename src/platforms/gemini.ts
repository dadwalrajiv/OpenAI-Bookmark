import { BasePlatform } from './base';
import { Message } from '../types/platform';

export class GeminiPlatform extends BasePlatform {
  name = 'gemini';
  
  detectPlatform(): boolean {
    const hostname = window.location.hostname;
    return hostname === 'gemini.google.com';
  }
  
  getMessages(): Message[] {
    console.log('🔍 Scanning for Gemini messages...');
    
    // User messages - multiple selectors for resilience
    const userMessages = document.querySelectorAll('.user-query-container, [class*="user-query-container"]');
    
    console.log(`Found ${userMessages.length} user messages`);
    
    const messages: Message[] = [];
    
    // Process user messages only (consistent with ChatGPT/Claude)
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
    
    // Sort by position on page
    messages.sort((a, b) => {
      const rectA = a.element.getBoundingClientRect();
      const rectB = b.element.getBoundingClientRect();
      return rectA.top - rectB.top;
    });
    
    console.log(`✅ Successfully parsed ${messages.length} messages total`);
    return messages;
  }
  
  /**
   * Generate a truly stable message ID based ONLY on content
   * Same approach as ChatGPT platform
   */
  private generateStableMessageId(role: string, text: string): string {
    // Use first 300 chars for better uniqueness
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
    // Gemini URL pattern: /app/... or /chat/...
    // Extract from pathname or generate unique ID
    const pathname = window.location.pathname;
    const match = pathname.match(/\/(app|chat)\/([^\/]+)/);
    return match ? match[2] : 'gemini_' + Date.now();
  }
  
  injectBookmarkButton(message: Message, onClick: (message: Message) => void, isBookmarked: boolean): void {
  if (message.element.querySelector('.bookmark-button')) {
    return;
  }
  
  // Gemini structure: Find the query-content container that holds action buttons
  const queryContent = message.element.querySelector('.query-content, [class*="query-content"]');
  if (!queryContent) {
    console.warn('❌ No query-content found');
    return;
  }
  
  // Find the action buttons container
  let actionButtonsContainer: HTMLElement | null = null;
  
  const allDivs = queryContent.querySelectorAll('div');
  for (const div of Array.from(allDivs)) {
    const hasMatButton = div.querySelector('button[mat-icon-button], button.mat-mdc-icon-button');
    if (hasMatButton) {
      actionButtonsContainer = div.parentElement as HTMLElement;
      break;
    }
  }
  
  if (!actionButtonsContainer) {
    console.warn('❌ Could not find action buttons container');
    return;
  }
  
  // Create wrapper div matching Gemini's structure
  const wrapper = document.createElement('div');
  wrapper.className = 'ng-star-inserted';
  
  // Create button - simplified structure
  const button = document.createElement('button');
  button.className = 'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base action-button bookmark-button';
  button.setAttribute('mat-icon-button', '');
  button.type = 'button';
  
  // Set attributes based on bookmarked state
  if (isBookmarked) {
    button.setAttribute('aria-label', 'Bookmarked');
    button.setAttribute('title', 'Bookmarked');
    button.style.cssText = 'cursor: default;';
  } else {
    button.setAttribute('aria-label', 'Bookmark this message');
    button.setAttribute('title', 'Bookmark this message');
    button.style.cssText = 'cursor: pointer;';
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(message);
    });
  }
  
  // Add ripple
  const ripple = document.createElement('span');
  ripple.className = 'mat-mdc-button-persistent-ripple mdc-icon-button__ripple';
  button.appendChild(ripple);
  
  // Add icon - use simple text node instead of mat-icon
  const iconSpan = document.createElement('span');
  iconSpan.style.cssText = 'font-size: 20px; line-height: 1; display: inline-block;';
  iconSpan.textContent = isBookmarked ? '🔖' : '📌';
  button.appendChild(iconSpan);
  
  // Add focus indicator
  const focusIndicator = document.createElement('span');
  focusIndicator.className = 'mat-focus-indicator';
  button.appendChild(focusIndicator);
  
  // Add touch target
  const touchTarget = document.createElement('span');
  touchTarget.className = 'mat-mdc-button-touch-target';
  button.appendChild(touchTarget);
  
  wrapper.appendChild(button);
  
  // Insert as first child
  actionButtonsContainer.insertBefore(wrapper, actionButtonsContainer.firstChild);
}
  
  scrollToMessage(messageId: string): void {
    console.log('📜 Scrolling to message:', messageId);
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (!messageElement) {
      console.warn('⚠️  Message not found in current view');
      alert('⚠️ Message Not Found\n\nThis message may be from an earlier part of the conversation that is no longer loaded.\n\nTip: Scroll up to load older messages, then try clicking the bookmark again.');
      return;
    }
    
    // Find the scrollable container (Gemini uses main scroll container)
    const scrollContainer = document.querySelector('main[role="main"]') as HTMLElement 
                         || messageElement.closest('[class*="overflow"]') as HTMLElement;
    
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
    element.style.backgroundColor = 'rgba(66, 133, 244, 0.15)'; // Google blue tint
    
    setTimeout(() => {
      element.style.backgroundColor = originalBackground;
      
      setTimeout(() => {
        element.style.transition = originalTransition;
      }, 300);
    }, 2000);
  }
}