import { BasePlatform } from './base';
import { Message } from '../types/platform';

export class ClaudePlatform extends BasePlatform {
  name = 'claude';
  
  detectPlatform(): boolean {
    return window.location.hostname === 'claude.ai';
  }
  
  getMessages(): Message[] {
    console.log('🔍 Scanning for Claude messages...');
    
    const userMessages = document.querySelectorAll('[data-testid="user-message"]');
    const assistantMessages = document.querySelectorAll('[data-test-render-count]');
    
    console.log(`Found ${userMessages.length} user messages, ${assistantMessages.length} assistant messages`);
    
    const messages: Message[] = [];
    
    // Process user messages
    userMessages.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      const text = this.extractText(htmlElement).trim();
      
      if (text.length > 0) {
        // Create stable ID based on content hash and position
        const messageId = this.generateStableMessageId('user', text, index);
        
        const message: Message = {
          id: messageId,
          element: htmlElement,
          text: text,
          role: 'user',
          timestamp: Date.now()
        };
        
        // Store reference for later lookup
        htmlElement.setAttribute('data-message-id', messageId);
        
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
        // Create stable ID based on content hash and position
        const messageId = this.generateStableMessageId('assistant', text, index);
        
        const message: Message = {
          id: messageId,
          element: htmlElement,
          text: text,
          role: 'assistant',
          timestamp: Date.now()
        };
        
        // Store reference for later lookup
        htmlElement.setAttribute('data-message-id', messageId);
        
        messages.push(message);
      }
    });
    
    messages.sort((a, b) => {
      const rectA = a.element.getBoundingClientRect();
      const rectB = b.element.getBoundingClientRect();
      return rectA.top - rectB.top;
    });
    
    console.log(`✅ Successfully parsed ${messages.length} messages total`);
    return messages;
  }
  
  /**
   * Generate a stable message ID based on role, content, and position
   * This ensures the same message gets the same ID across page refreshes
   */
  private generateStableMessageId(role: string, text: string, index: number): string {
    // Use first 100 chars of text + position to create a stable hash
    const contentHash = this.simpleHash(text.substring(0, 100));
    return `${role}_${index}_${contentHash}`;
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
  
 injectBookmarkButton(message: Message, onClick: (message: Message) => void): void {
  if (message.element.querySelector('.bookmark-button')) {
    return;
  }
  
  const actionBar = message.element.querySelector('[role="group"][aria-label="Message actions"]');
  
  if (!actionBar) {
    console.warn('Could not find action bar for message:', message.id);
    return;
  }
  
  const button = document.createElement('button');
  button.className = 'bookmark-button inline-flex items-center justify-center relative shrink-0 select-none border-transparent transition font-base duration-300 h-8 w-8 rounded-md active:scale-95 group';
  button.type = 'button';
  button.setAttribute('aria-label', 'Bookmark this message');
  button.style.cssText = 'cursor: pointer; opacity: 0.6; transition: opacity 0.2s;';
  
  button.addEventListener('mouseenter', () => {
    button.style.opacity = '1';
  });
  button.addEventListener('mouseleave', () => {
    button.style.opacity = '0.6';
  });
  
  // Create icon using DOM instead of innerHTML (safer)
  const iconContainer = document.createElement('div');
  iconContainer.className = 'flex items-center justify-center';
  iconContainer.style.cssText = 'width: 20px; height: 20px; font-size: 16px;';
  iconContainer.textContent = '📌'; // textContent is XSS-safe
  button.appendChild(iconContainer);
  
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(message);
  });
  
  const firstAction = actionBar.querySelector('div[data-state]');
  if (firstAction && firstAction.parentElement) {
    firstAction.parentElement.insertBefore(button, firstAction);
  }
}
  
 scrollToMessage(messageId: string): void {
  console.log('📜 Scrolling to message:', messageId);
  
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