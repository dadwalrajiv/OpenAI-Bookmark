import { BasePlatform } from './base';
import { Message } from '../types/platform';

export class CopilotPlatform extends BasePlatform {
  name = 'copilot';
  
  detectPlatform(): boolean {
    const hostname = window.location.hostname;
    return hostname === 'copilot.microsoft.com';
  }
  
 
  getMessages(): Message[] {
  console.log('🔍 Scanning for Copilot messages...');
  
  // User messages only
  const userMessages = document.querySelectorAll('[data-content="user-message"]');
  
  console.log(`Found ${userMessages.length} user messages`);
  
  const messages: Message[] = [];
  
  userMessages.forEach((element, index) => {
    const htmlElement = element as HTMLElement;
    
    // Find the parent container (the one with id ending in "-user-message")
    const container = htmlElement.closest('[id$="-user-message"]') as HTMLElement;
    if (!container) {
      console.warn('Could not find message container');
      return;
    }
    
    const text = this.extractText(htmlElement).trim();
    
    if (text.length > 0) {
      let messageId = container.getAttribute('data-message-id');
      
      if (!messageId) {
        messageId = this.generateStableMessageId('user', text);
        container.setAttribute('data-message-id', messageId);
        console.log(`🆕 Generated new ID for user message: ${messageId}`);
      }
      
      const message: Message = {
        id: messageId,
        element: container,
        text: text,
        role: 'user',
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
  
  console.log(`✅ Successfully parsed ${messages.length} messages total`);
  return messages;
}
  
  private generateStableMessageId(role: string, text: string): string {
    const contentSample = text.substring(0, 300);
    const contentHash = this.simpleHash(contentSample);
    const prefix = text.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
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
    // URL: https://copilot.microsoft.com/chats/AvbyFyBmviid3YwNSFQv2
    const pathname = window.location.pathname;
    const match = pathname.match(/\/chats\/([^\/]+)/);
    return match ? match[1] : 'copilot_' + Date.now();
  }
  
    injectBookmarkButton(message: Message, onClick: (message: Message) => void, isBookmarked: boolean): void {
  if (message.element.querySelector('.bookmark-button')) {
    return;
  }
  
  // Create action buttons container
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'flex items-center mt-2 copilot-bookmark-container';
  actionsContainer.style.cssText = 'justify-content: flex-end; padding-right: 16px;';
  
  // Create bookmark button
  const button = document.createElement('button');
  button.className = 'relative flex items-center text-foreground-800 fill-foreground-800 bg-transparent hover:bg-black/5 active:bg-black/3 text-sm justify-center size-9 rounded-xl bookmark-button';
  button.setAttribute('type', 'button');
  button.setAttribute('data-testid', 'bookmark-button');
  
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
  
  // Add icon
  const icon = document.createElement('span');
  icon.style.cssText = 'font-size: 18px; line-height: 1;';
  icon.textContent = isBookmarked ? '🔖' : '📌';
  button.appendChild(icon);
  
  actionsContainer.appendChild(button);
  message.element.appendChild(actionsContainer);
  
  // NO event listeners - CSS will handle it with pointer-events fix
}
  
  scrollToMessage(messageId: string): void {
    console.log('📜 Scrolling to message:', messageId);
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (!messageElement) {
      console.warn('⚠️  Message not found in current view');
      alert('⚠️ Message Not Found\n\nThis message may be from an earlier part of the conversation that is no longer loaded.\n\nTip: Scroll up to load older messages, then try clicking the bookmark again.');
      return;
    }
    
    // Scroll to message
    messageElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    
    this.highlightElement(messageElement as HTMLElement);
  }
  
  private highlightElement(element: HTMLElement): void {
    const originalBackground = element.style.backgroundColor;
    const originalTransition = element.style.transition;
    
    element.style.transition = 'background-color 0.3s ease';
    element.style.backgroundColor = 'rgba(0, 120, 212, 0.15)'; // Microsoft blue tint
    
    setTimeout(() => {
      element.style.backgroundColor = originalBackground;
      
      setTimeout(() => {
        element.style.transition = originalTransition;
      }, 300);
    }, 2000);
  }
}