import { BasePlatform } from './base';
import { Message } from '../types/platform';
import { Bookmark } from '../types/bookmark';

export class ChatGPTPlatform extends BasePlatform {
  name = 'chatgpt';

  detectPlatform(): boolean {
    const hostname = window.location.hostname;
    return hostname === 'chatgpt.com' || hostname === 'chat.openai.com';
  }

  getScrollContainer(): HTMLElement | null {
    const allDivs = Array.from(document.querySelectorAll('div'));
    const withMessages = allDivs.filter(el => {
      if (el.scrollHeight <= el.clientHeight + 100) return false;
      if (el.scrollHeight < 1000) return false;
      const style = window.getComputedStyle(el);
      if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') return false;
      return el.querySelector('[data-message-author-role]') !== null;
    });
    if (withMessages.length === 0) return null;
    withMessages.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return withMessages[0];
  }

  getTurnNumber(messageElement: HTMLElement): number {
    const section = messageElement.closest(
      '[data-testid*="conversation-turn-"]'
    ) as HTMLElement | null;
    if (!section) return 0;
    const m = section.getAttribute('data-testid')?.match(/conversation-turn-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  getMaxTurnNumber(): number {
    let max = 0;
    document.querySelectorAll('[data-testid*="conversation-turn-"]').forEach(t => {
      const m = t.getAttribute('data-testid')?.match(/conversation-turn-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
  }

  getMessages(): Message[] {
    const messages: Message[] = [];

    document.querySelectorAll('[data-message-author-role="user"]').forEach((element) => {
      const htmlElement = element as HTMLElement;
      const text = this.extractText(htmlElement).trim();
      if (text.length > 0) {
        let messageId = htmlElement.getAttribute('data-message-id');
        if (!messageId) {
          messageId = this.generateStableMessageId('user', text);
          htmlElement.setAttribute('data-message-id', messageId);
        }
        messages.push({ id: messageId, element: htmlElement, text, role: 'user', timestamp: Date.now() });
      }
    });

    document.querySelectorAll('[data-message-author-role="assistant"]').forEach((element) => {
      const htmlElement = element as HTMLElement;
      const text = this.extractText(htmlElement).trim();
      if (text.length > 10) {
        let messageId = htmlElement.getAttribute('data-message-id');
        if (!messageId) {
          messageId = this.generateStableMessageId('assistant', text);
          htmlElement.setAttribute('data-message-id', messageId);
        }
        messages.push({ id: messageId, element: htmlElement, text, role: 'assistant', timestamp: Date.now() });
      }
    });

    messages.sort((a, b) => {
      const rectA = a.element.getBoundingClientRect();
      const rectB = b.element.getBoundingClientRect();
      return rectA.top - rectB.top;
    });

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
    const match = window.location.pathname.match(/\/c\/([^\/]+)/);
    return match ? match[1] : 'chatgpt_' + Date.now();
  }

  injectBookmarkButton(
    message: Message,
    onClick: (message: Message) => void,
    bookmark: Bookmark | null
  ): void {
    if (message.element.querySelector('.bookmark-button')) return;

    const grandparent = message.element.parentElement?.parentElement as HTMLElement | null;
    if (!grandparent) return;

    const actionBar = grandparent.querySelector(
      '[aria-label="Your message actions"]'
    ) as HTMLElement | null;
    if (!actionBar) return;

    const isBookmarked = bookmark !== null;
    const button = document.createElement('button');
    button.className = 'bookmark-button text-token-text-secondary hover:bg-token-surface-hover rounded-lg';
    button.type = 'button';

    if (isBookmarked) {
      button.setAttribute('aria-label', 'Bookmarked');
      button.setAttribute('title', bookmark.note || 'Bookmarked');
      button.style.cursor = 'default';
    } else {
      button.setAttribute('aria-label', 'Bookmark this message');
      button.setAttribute('title', 'Bookmark this message');
      button.style.cursor = 'pointer';
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

    const firstButton = actionBar.querySelector('button');
    if (firstButton) {
      actionBar.insertBefore(button, firstButton);
    } else {
      actionBar.appendChild(button);
    }

    const uid = `bm-${Math.random().toString(36).slice(2, 8)}`;
    button.setAttribute('data-bm-uid', uid);
    const style = document.createElement('style');
    const setOpacity = (op: string) => {
      style.textContent = `[data-bm-uid="${uid}"] { opacity: ${op} !important; pointer-events: auto !important; }`;
    };
    setOpacity(isBookmarked ? '1' : '0.4');
    document.head.appendChild(style);
    if (!isBookmarked) {
      button.addEventListener('mouseenter', () => setOpacity('1'));
      button.addEventListener('mouseleave', () => setOpacity('0.4'));
    }
  }

  /**
   * Scroll to a message.
   * Strategy 1: find by data-message-id (element in DOM)
   * Strategy 2: find by turn number (more reliable — immune to ID changes)
   * Strategy 3: message not in DOM — scroll to proportional position,
   *             ChatGPT will render it as user scrolls from there
   */
  scrollToMessage(messageId: string, turnNumber?: number): void {
    const container = this.getScrollContainer();
    if (!container) { this.showNotFoundAlert(); return; }

    // Strategy 1: element in DOM by ID
    const existing = document.querySelector(
      `[data-message-id="${messageId}"]`
    ) as HTMLElement | null;
    if (existing) {
      this.scrollElementIntoView(existing, container);
      return;
    }

    // Strategy 2: turn section in DOM
    if (turnNumber && turnNumber > 0) {
      const section = document.querySelector(
        `[data-testid="conversation-turn-${turnNumber}"]`
      ) as HTMLElement | null;
      if (section) {
        const userMsg = section.querySelector(
          '[data-message-author-role="user"]'
        ) as HTMLElement | null;
        if (userMsg) {
          userMsg.setAttribute('data-message-id', messageId);
          this.scrollElementIntoView(userMsg, container);
          return;
        }
      }
    }

    // Strategy 3: not in DOM — scroll to approximate position
    // ChatGPT will render the message as user scrolls from there
    if (turnNumber && turnNumber > 0) {
      const maxTurn = this.getMaxTurnNumber() || turnNumber;
      const ratio = maxTurn > 1 ? (turnNumber - 1) / (maxTurn - 1) : 0;
      container.scrollTo({
        top: Math.floor(ratio * container.scrollHeight),
        behavior: 'smooth'
      });
      return;
    }

    this.showNotFoundAlert();
  }

  private scrollElementIntoView(element: HTMLElement, container: HTMLElement): void {
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const absoluteTop = container.scrollTop + (elementRect.top - containerRect.top);
    container.scrollTo({ top: Math.max(0, absoluteTop - 100), behavior: 'smooth' });
    this.highlightElement(element);
  }

  private showNotFoundAlert(): void {
    alert('⚠️ Message Not Found\n\nThis message could not be located in the conversation.');
  }

  private highlightElement(element: HTMLElement): void {
    const originalBackground = element.style.backgroundColor;
    const originalTransition = element.style.transition;
    element.style.transition = 'background-color 0.3s ease';
    element.style.backgroundColor = 'rgba(255, 255, 0, 0.2)';
    setTimeout(() => {
      element.style.backgroundColor = originalBackground;
      setTimeout(() => { element.style.transition = originalTransition; }, 300);
    }, 2000);
  }
}