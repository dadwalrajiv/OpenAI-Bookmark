import { BasePlatform } from './base';
import { Message } from '../types/platform';
import { Bookmark } from '../types/bookmark';

export class CopilotPlatform extends BasePlatform {
  name = 'copilot';
  
  detectPlatform(): boolean {
    const hostname = window.location.hostname;
    return hostname === 'copilot.microsoft.com';
  }
  
  getMessages(): Message[] {
    //console.log('🔍 Scanning for Copilot messages...');
    
    // Find all user message containers by their ID pattern
    const userContainers = document.querySelectorAll('[id$="-user-message"]');
    
    //console.log(`Found ${userContainers.length} user message containers`);
    
    const messages: Message[] = [];
    
    userContainers.forEach((container) => {
      const htmlElement = container as HTMLElement;
      
      // Extract text from the data-content div
      const contentDiv = htmlElement.querySelector('[data-content="user-message"]');
      if (!contentDiv) {
        return;
      }
      
      const text = this.extractText(contentDiv as HTMLElement).trim();
      
      if (text.length === 0) {
        return;
      }
      
      // Check for existing message ID on container
      let messageId = htmlElement.getAttribute('data-message-id');
      
      if (!messageId) {
        messageId = this.generateStableMessageId('user', text);
        htmlElement.setAttribute('data-message-id', messageId);
        //console.log(`🆕 Generated new ID for user message: ${messageId}`);
      }
      
      const message: Message = {
        id: messageId,
        element: htmlElement, // Use container as element
        text: text,
        role: 'user',
        timestamp: Date.now()
      };
      
      messages.push(message);
    });
    
    messages.sort((a, b) => {
      const rectA = a.element.getBoundingClientRect();
      const rectB = b.element.getBoundingClientRect();
      return rectA.top - rectB.top;
    });
    
    //console.log(`✅ Successfully parsed ${messages.length} messages total`);
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
    const pathname = window.location.pathname;
    const match = pathname.match(/\/chats\/([^\/]+)/);
    return match ? match[1] : 'copilot_' + Date.now();
  }
  
  injectBookmarkButton(message: Message, onClick: (message: Message) => void, bookmark: Bookmark | null): void {
  // Check if button already exists
  if (message.element.querySelector('.bookmark-button')) {
    return;
  }
  
  // Find the message bubble
  const messageBubble = message.element.querySelector('[data-content="user-message"]') as HTMLElement;
  if (!messageBubble) {
    console.warn('❌ No message bubble found for', message.id);
    return;
  }
  
  // Traverse up exactly 2 levels from bubble to get "Parent 2"
  const parent0 = messageBubble.parentElement; // flex w-full flex-col gap-1
  const parent1 = parent0?.parentElement;      // flex w-full items-start
  const parent2 = parent1?.parentElement;      // flex w-full flex-col gap-1 (TARGET)
  
  if (!parent2) {
    console.warn('❌ Could not find target container for', message.id);
    return;
  }
  
  const isBookmarked = bookmark !== null;
  
  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'flex items-start justify-end bookmark-button-container';
  buttonContainer.style.cssText = isBookmarked 
    ? 'margin-top: 4px; opacity: 1;' 
    : 'margin-top: 4px; opacity: 0; transition: opacity 0.2s;';
  
  // Create bookmark button
  const button = document.createElement('button');
  button.className = 'bookmark-button flex items-center gap-1.5 text-xs text-foreground-600 hover:text-foreground-800 hover:bg-black/5 transition-all rounded-lg';
  button.setAttribute('type', 'button');
  button.style.cssText = 'background: none; border: none; padding: 4px 8px; cursor: pointer;';
  
  if (isBookmarked) {
    button.setAttribute('aria-label', 'Bookmarked');
    button.setAttribute('title', bookmark.note || 'Bookmarked');
  } else {
    button.setAttribute('aria-label', 'Bookmark this message');
    button.setAttribute('title', 'Bookmark this message');
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(message);
    });
  }
  
  // Add icon
  const icon = document.createElement('span');
  icon.style.cssText = 'font-size: 14px; line-height: 1;';
  icon.textContent = isBookmarked ? '🔖' : '📌';
  button.appendChild(icon);
  
  // Add label
  const label = document.createElement('span');
  label.textContent = isBookmarked ? 'Bookmarked' : 'Bookmark';
  button.appendChild(label);
  
  buttonContainer.appendChild(button);
  parent2.appendChild(buttonContainer);
  
  // Show on hover for non-bookmarked messages
  if (!isBookmarked) {
    const showButton = () => {
      buttonContainer.style.opacity = '1';
    };
    const hideButton = () => {
      buttonContainer.style.opacity = '0';
    };
    
    message.element.addEventListener('mouseenter', showButton);
    message.element.addEventListener('mouseleave', hideButton);
    
    // Store cleanup function for potential future use
    (buttonContainer as any)._cleanup = () => {
      message.element.removeEventListener('mouseenter', showButton);
      message.element.removeEventListener('mouseleave', hideButton);
    };
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
    element.style.backgroundColor = 'rgba(0, 120, 212, 0.15)';
    
    setTimeout(() => {
      element.style.backgroundColor = originalBackground;
      
      setTimeout(() => {
        element.style.transition = originalTransition;
      }, 300);
    }, 2000);
  }
}