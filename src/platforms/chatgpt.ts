import { BasePlatform } from './base';
import { Message } from '../types/platform';

export class ChatGPTPlatform extends BasePlatform {
  name = 'chatgpt';
  
  detectPlatform(): boolean {
    const hostname = window.location.hostname;
    return hostname === 'chatgpt.com' || hostname === 'chat.openai.com';
  }
  
  getMessages(): Message[] {
    console.log('🔍 Scanning for ChatGPT messages...');
    
    // Both user and assistant messages have data-message-author-role attribute
    const userMessages = document.querySelectorAll('[data-message-author-role="user"]');
    const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
    
    console.log(`Found ${userMessages.length} user messages, ${assistantMessages.length} assistant messages`);
    
    const messages: Message[] = [];
    
    // Process user messages
    userMessages.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      const text = this.extractText(htmlElement).trim();
      
      if (text.length > 0) {
        const nativeId = htmlElement.getAttribute('data-message-id');
        const messageId = nativeId || this.generateStableMessageId('user', text, index);
        
        const message: Message = {
          id: messageId,
          element: htmlElement,
          text: text,
          role: 'user',
          timestamp: Date.now()
        };
        
        htmlElement.setAttribute('data-message-id', messageId);
        messages.push(message);
      }
    });
    
    // Process assistant messages
    assistantMessages.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      const text = this.extractText(htmlElement).trim();
      
      if (text.length > 10) {
        const nativeId = htmlElement.getAttribute('data-message-id');
        const messageId = nativeId || this.generateStableMessageId('assistant', text, index);
        
        const message: Message = {
          id: messageId,
          element: htmlElement,
          text: text,
          role: 'assistant',
          timestamp: Date.now()
        };
        
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
  
  private generateStableMessageId(role: string, text: string, index: number): string {
    const contentHash = this.simpleHash(text.substring(0, 100));
    return `${role}_${index}_${contentHash}`;
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
  
  injectBookmarkButton(message: Message, onClick: (message: Message) => void): void {
    console.log('🔍 Attempting to inject button for:', message.id);
    
    if (message.element.querySelector('.bookmark-button')) {
      console.log('⏭️  Button already exists');
      return;
    }
    
    // Find the parent turn container
    const turnContainer = message.element.closest('.group\\/turn-messages');
    if (!turnContainer) {
      console.warn('❌ No turn container found');
      return;
    }
    
    // Find the action bar - it's the next sibling div after the message
    const actionBar = turnContainer.querySelector('.z-0.flex');
    
    if (!actionBar) {
      console.warn('❌ Could not find action bar');
      return;
    }
    
    console.log('✅ Found action bar:', actionBar);
    
    const button = document.createElement('button');
    button.className = 'bookmark-button text-token-text-secondary hover:bg-token-bg-secondary rounded-lg';
    button.type = 'button';
    button.setAttribute('aria-label', 'Bookmark this message');
    button.setAttribute('data-state', 'closed');
    
    const span = document.createElement('span');
    span.className = 'flex items-center justify-center touch:w-10 h-8 w-8';
    
    const iconText = document.createElement('span');
    iconText.textContent = '📌';
    iconText.style.cssText = 'font-size: 16px;';
    
    span.appendChild(iconText);
    button.appendChild(span);
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(message);
    });
    
    // Find the button container inside action bar
    const buttonContainer = actionBar.querySelector('div[class*="flex-wrap"]');
    const firstButton = buttonContainer?.querySelector('button') || actionBar.querySelector('button');
    
    console.log('First button:', firstButton);
    
    if (firstButton && firstButton.parentElement) {
      firstButton.parentElement.insertBefore(button, firstButton);
      console.log('✅ Bookmark button injected!');
    } else {
      console.warn('❌ Could not find first button');
    }
  }
  
 scrollToMessage(messageId: string): void {
  console.log('📜 Scrolling to message:', messageId);
  
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