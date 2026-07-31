import { BasePlatform } from './base';
import { Message } from '../types/platform';
import { Bookmark } from '../types/bookmark';

export class GeminiPlatform extends BasePlatform {
  name = 'gemini';

  detectPlatform(): boolean {
    return window.location.hostname === 'gemini.google.com';
  }

  getMessages(): Message[] {
    const userQueryElements = document.querySelectorAll('user-query');
    const messages: Message[] = [];
    const seenIds = new Set<string>();

    userQueryElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      const text = this.extractText(htmlElement).trim();
      if (text.length === 0) return;

      let messageId = htmlElement.getAttribute('data-message-id');
      if (!messageId) {
        messageId = this.generateStableMessageId('user', text);
        htmlElement.setAttribute('data-message-id', messageId);
      }

      if (seenIds.has(messageId)) return;
      seenIds.add(messageId);

      messages.push({
        id: messageId,
        element: htmlElement,
        text,
        role: 'user',
        timestamp: Date.now()
      });
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
    const pathname = window.location.pathname;
    const match = pathname.match(/\/(app|chat)\/([^\/]+)/);
    return match ? match[2] : 'gemini_' + Date.now();
  }

  injectBookmarkButton(
    message: Message,
    onClick: (message: Message) => void,
    bookmark: Bookmark | null
  ): void {
    if (message.element.querySelector('.bookmark-button')) return;

    // .luminous-actions-container is always present on every message (confirmed from DOM):
    // - Message 0: luminous-toggle-container=false, luminous-actions-container=true
    // - Message 1+: both present
    // .luminous-toggle-container sits inside the message bubble (wrong position).
    // .luminous-actions-container sits below the bubble as a proper toolbar (correct).
    const actionButtonsParent = message.element.querySelector('.luminous-actions-container') as HTMLElement | null;

    if (!actionButtonsParent) {
      console.warn('❌ Could not find luminous-actions-container for', message.id);
      return;
    }

    const isBookmarked = bookmark !== null;

    const button = document.createElement('button');
    button.className = 'mdc-icon-button mat-mdc-icon-button mat-mdc-button-base action-button bookmark-button';
    button.setAttribute('mat-icon-button', '');
    button.setAttribute('type', 'button');

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

    // Ripple
    const ripple = document.createElement('span');
    ripple.className = 'mat-mdc-button-persistent-ripple mdc-icon-button__ripple';
    button.appendChild(ripple);

    // Icon
    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = 'font-size: 20px; line-height: 1; display: inline-block;';
    iconSpan.textContent = isBookmarked ? '🔖' : '📌';
    button.appendChild(iconSpan);

    // Focus indicator
    const focusIndicator = document.createElement('span');
    focusIndicator.className = 'mat-focus-indicator';
    button.appendChild(focusIndicator);

    // Touch target
    const touchTarget = document.createElement('span');
    touchTarget.className = 'mat-mdc-button-touch-target';
    button.appendChild(touchTarget);

    // Insert before the first direct child of luminous-actions-container.
    // The children are <gem-icon-button> custom elements — NOT plain <button>.
    // querySelector('button') digs into their internals so we use firstElementChild instead.
    const firstChild = actionButtonsParent.firstElementChild;
    if (firstChild) {
      actionButtonsParent.insertBefore(button, firstChild);
    } else {
      actionButtonsParent.appendChild(button);
    }

    // The CSS rule sets opacity: 0 on .action-button via an Angular scoped attribute
    // selector (_ngcontent-*). Our button has the action-button class but no _ngcontent
    // attribute, so the rule doesn't directly apply — but computed opacity is still 0
    // due to parent inheritance. Override with a scoped !important style tag,
    // same approach confirmed working on Claude.
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

  scrollToMessage(messageId: string): void {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) {
      console.warn('⚠️ Message not found');
      alert('⚠️ Message Not Found\n\nThis message could not be found in the conversation.');
      return;
    }

    // There are multiple infinite-scroller elements — pick the one that
    // contains user-query elements (the chat content), not the sidebar.
    const allScrollers = Array.from(document.querySelectorAll('infinite-scroller')) as HTMLElement[];
    const scroller = allScrollers.find(s => s.querySelector('user-query')) || null;

    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      const containerRect = scroller.getBoundingClientRect();
      const elementRect = messageElement.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top;
      scroller.scrollTo({
        top: scroller.scrollTop + relativeTop - 100,
        behavior: 'smooth'
      });
    } else {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    this.highlightElement(messageElement as HTMLElement);
  }

  private highlightElement(element: HTMLElement): void {
    const originalBackground = element.style.backgroundColor;
    const originalTransition = element.style.transition;
    element.style.transition = 'background-color 0.3s ease';
    element.style.backgroundColor = 'rgba(66, 133, 244, 0.15)';
    setTimeout(() => {
      element.style.backgroundColor = originalBackground;
      setTimeout(() => { element.style.transition = originalTransition; }, 300);
    }, 2000);
  }
}