import { BasePlatform } from './base';
import { Message } from '../types/platform';
import { Bookmark } from '../types/bookmark';

export class ClaudePlatform extends BasePlatform {
  name = 'claude';

  detectPlatform(): boolean {
    return window.location.hostname === 'claude.ai';
  }

  // Incremented on each scrollToMessage call — running searches check this
  // and abort immediately if cancelled by a newer click.
  private searchToken = 0;

  getScrollContainer(): HTMLElement | null {
    const candidates = Array.from(
      document.querySelectorAll('div.overflow-y-auto')
    ) as HTMLElement[];

    const scrollable = candidates.filter(el =>
      el.scrollHeight > el.clientHeight + 100 &&
      el.scrollHeight > 2000
    );

    if (scrollable.length === 0) return null;
    scrollable.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return scrollable[0];
  }

  getTotalMessageCount(): number {
    const article = document.querySelector('[role="article"][aria-setsize]');
    if (!article) return 0;
    return parseInt(article.getAttribute('aria-setsize') || '0', 10);
  }

  getTotalUserMessageCount(): number {
    const total = this.getTotalMessageCount();
    if (total === 0) return 0;
    return Math.ceil(total / 2);
  }

  getMessagePosinset(messageElement: HTMLElement): number {
    const article = messageElement.closest('[role="article"][aria-posinset]');
    if (!article) return 0;
    return parseInt(article.getAttribute('aria-posinset') || '0', 10);
  }

  getMessages(): Message[] {
    const messages: Message[] = [];

    // --- User messages: plain text ---
    const userMessages = document.querySelectorAll('[data-testid="user-message"]');
    userMessages.forEach((element) => {
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

    // --- User messages: pasted file / attachment ---
    const actionBars = document.querySelectorAll('[data-message-action-bar]');
    actionBars.forEach((bar) => {
      const outerWrapper = bar.closest('div.group') as HTMLElement | null;
      if (!outerWrapper) return;
      if (outerWrapper.querySelector('[data-testid="user-message"]')) return;
      if (outerWrapper.getAttribute('data-message-id')) return;

      const article = outerWrapper.closest('[role="article"]');
      if (article && article.querySelector('[data-test-render-count]')) return;

      const bodyDiv = bar.closest('div.flex.flex-col.items-end') as HTMLElement | null;
      const text = bodyDiv ? this.extractText(bodyDiv).trim() : '';
      const fileLabel = outerWrapper.querySelector(
        '[aria-label*="pasted" i], [aria-label*="attachment" i], [aria-label*="file" i]'
      );
      const idSource = text.length > 0
        ? text
        : fileLabel?.getAttribute('aria-label') || `attachment_${Date.now()}`;

      const messageId = this.generateStableMessageId('user', idSource);
      outerWrapper.setAttribute('data-message-id', messageId);
      messages.push({ id: messageId, element: outerWrapper, text: idSource, role: 'user', timestamp: Date.now() });
    });

    // --- Assistant messages ---
    const assistantMessages = document.querySelectorAll('[data-test-render-count]');
    assistantMessages.forEach((element) => {
      const htmlElement = element as HTMLElement;
      const contentDiv = htmlElement.querySelector('.font-claude-response');
      const targetElement = contentDiv || htmlElement;
      const text = this.extractText(targetElement as HTMLElement).trim();
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
    const match = window.location.pathname.match(/\/chat\/([^\/]+)/);
    return match ? match[1] : 'unknown';
  }

  injectBookmarkButton(
    message: Message,
    onClick: (message: Message) => void,
    bookmark: Bookmark | null
  ): void {
    if (message.element.querySelector('.bookmark-button')) return;

    let actionBarWrapper: HTMLElement | null = null;
    let searchElement: HTMLElement | null = message.element;
    let attempts = 0;

    while (searchElement && attempts < 8) {
      const found = searchElement.querySelector('[data-message-action-bar]') as HTMLElement | null;
      if (found) { actionBarWrapper = found; break; }
      if (searchElement.hasAttribute('data-message-action-bar')) { actionBarWrapper = searchElement; break; }
      searchElement = searchElement.parentElement;
      attempts++;
    }

    if (!actionBarWrapper) {
      console.warn('Could not find action bar wrapper for message:', message.id);
      return;
    }

    const toolbar = actionBarWrapper.querySelector(
      '[role="toolbar"][aria-label="Message actions"], [aria-label="Message actions"]'
    ) as HTMLElement | null;

    let insertTarget: HTMLElement | null = null;
    let insertBefore: HTMLElement | null = null;

    if (toolbar) {
      const firstFlexContainer = toolbar.querySelector('div.flex.items-center') as HTMLElement | null;
      if (firstFlexContainer) {
        insertTarget = firstFlexContainer;
        insertBefore = firstFlexContainer.firstElementChild as HTMLElement | null;
      }
    }

    if (!insertTarget) insertTarget = actionBarWrapper;

    const isBookmarked = bookmark !== null;
    this.createAndInsertButton(insertTarget, insertBefore, onClick, message, isBookmarked, bookmark?.note);
  }

  private createAndInsertButton(
    container: HTMLElement,
    insertBefore: HTMLElement | null,
    onClick: (message: Message) => void,
    message: Message,
    isBookmarked: boolean,
    bookmarkNote?: string
  ): void {
    const button = document.createElement('button');
    button.className = 'bookmark-button cds-reset group/btn relative isolate inline-flex shrink-0 items-center justify-center';
    button.type = 'button';

    if (isBookmarked) {
      button.setAttribute('aria-label', 'Bookmarked');
      button.setAttribute('title', bookmarkNote || 'Bookmarked');
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

    const iconContainer = document.createElement('div');
    iconContainer.className = 'flex items-center justify-center';
    iconContainer.style.cssText = 'width: 20px; height: 20px; font-size: 16px;';
    iconContainer.textContent = isBookmarked ? '🔖' : '📌';
    button.appendChild(iconContainer);

    if (insertBefore && container.contains(insertBefore)) {
      container.insertBefore(button, insertBefore);
    } else {
      container.appendChild(button);
    }

    // Parent [data-message-action-bar] has opacity-0 — override with scoped style
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
   * Scroll to a message by ID.
   *
   * Strategy (in order):
   * 1. Element in DOM by data-message-id → instant
   * 2. Article in DOM by aria-posinset → instant (element re-rendered without our attribute)
   * 3. Binary search by aria-posinset → ~5 steps at 150ms, always restores on failure
   * 4. Full scan top-to-bottom → fallback for old bookmarks without stored posinset,
   *    always restores scroll position on failure
   */
  scrollToMessage(messageId: string, posinset?: number): void {
    this.searchToken++;
    const token = this.searchToken;

    const container = this.getScrollContainer();
    if (!container) { this.showNotFoundAlert(); return; }

    // Strategy 1: element already in DOM
    const existing = document.querySelector(
      `[data-message-id="${messageId}"]`
    ) as HTMLElement | null;
    if (existing) { this.scrollElementIntoView(existing); return; }

    // Strategy 2: article in DOM by posinset
    if (posinset && posinset > 0) {
      const article = document.querySelector(
        `[role="article"][aria-posinset="${posinset}"]`
      ) as HTMLElement | null;
      if (article) {
        const userMsg = this.getUserMsgFromArticle(article);
        if (userMsg) {
          userMsg.setAttribute('data-message-id', messageId);
          this.scrollElementIntoView(userMsg);
          return;
        }
      }
    }

    // Strategy 3: binary search (new bookmarks — posinset stored at save time)
    if (posinset && posinset > 0) {
      this.binarySearch(messageId, posinset, container, token);
      return;
    }

    // Strategy 4: full scan (old bookmarks without posinset)
    this.fullScan(messageId, container, token);
  }

  private getUserMsgFromArticle(article: Element): HTMLElement | null {
    const direct = article.querySelector('[data-testid="user-message"]') as HTMLElement | null;
    if (direct) return direct;
    const bar = article.querySelector('[data-message-action-bar]') as HTMLElement | null;
    return bar ? bar.closest('div.group') as HTMLElement | null : null;
  }

  /**
   * Event-driven search using MutationObserver + binary search.
   *
   * Instead of polling with fixed timeouts (unreliable — races React scheduler),
   * we watch the DOM for article elements being added. Claude adds articles via
   * DOM mutations (confirmed from console test — MutationObserver catches them).
   *
   * Algorithm:
   * 1. Set up MutationObserver watching for article additions
   * 2. On each batch of new articles, check if target posinset appeared
   * 3. If yes → scroll to it, done
   * 4. If no → read visible range, binary search to next scrollTop
   * 5. 10 second safety timeout → restore scroll, disconnect, alert
   */
  private binarySearch(
    messageId: string,
    posinset: number,
    container: HTMLElement,
    token: number
  ): void {
    const savedScrollTop = container.scrollTop;
    let lo = 0;
    let hi = container.scrollHeight;
    let observer: MutationObserver | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (observer) { observer.disconnect(); observer = null; }
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    };

    const fail = () => {
      if (this.searchToken !== token) return;
      cleanup();
      container.scrollTop = savedScrollTop;
      this.showNotFoundAlert();
    };

    const found = (article: Element) => {
      cleanup();
      const userMsg = this.getUserMsgFromArticle(article);
      if (userMsg) {
        userMsg.setAttribute('data-message-id', messageId);
        this.scrollElementIntoView(userMsg);
      } else {
        fail();
      }
    };

    const adjustScroll = () => {
      if (this.searchToken !== token) { cleanup(); container.scrollTop = savedScrollTop; return; }

      const cur = container.scrollTop;
      const containerRect = container.getBoundingClientRect();

      // Claude always keeps the last few articles pinned in DOM regardless of
      // scroll position (confirmed: posinsets 202-204 always present even at top).
      // We must filter these out or they corrupt the visible range calculation.
      // We detect "pinned" articles by checking if they are actually visible
      // in the current viewport — only use articles whose top is within
      // the container's visible area (+/- 2x container height for buffer).
      const allArticles = document.querySelectorAll('[role="article"][aria-posinset]');
      const viewportArticles = Array.from(allArticles).filter(a => {
        const rect = a.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        // Article is "near" the viewport if within 2x container height
        return relativeTop > -containerRect.height * 2 &&
               relativeTop < containerRect.height * 3;
      });

      const visible = viewportArticles
        .map(a => parseInt(a.getAttribute('aria-posinset') || '0', 10))
        .filter(n => n > 0);

      if (visible.length === 0) {
        // No viewport-local articles — jump to midpoint
        container.scrollTop = Math.floor((lo + hi) / 2);
        return;
      }

      const min = Math.min(...visible);
      const max = Math.max(...visible);

      if (posinset < min) {
        hi = cur;
      } else if (posinset > max) {
        lo = cur;
      } else {
        // Target is in viewport range but specific article not rendered.
        // Nudge slightly to trigger Claude to render adjacent articles.
        const nudge = posinset <= (min + max) / 2
          ? Math.max(0, cur - 500)
          : Math.min(container.scrollHeight, cur + 500);
        container.scrollTop = nudge;
        return;
      }

      const mid = Math.floor((lo + hi) / 2);

      // Convergence guard
      if (hi - lo < 300 && Math.abs(mid - cur) < 150) {
        fail();
        return;
      }

      container.scrollTop = mid;
    };

    // Set up MutationObserver — fires the instant React adds articles.
    // Observe only the scroll CONTAINER not document.body — this prevents
    // firing on sidebar React re-renders which would cause infinite loops.
    // Claude adds/removes articles via real DOM mutations (confirmed from
    // console test) so this catches every article render.
    observer = new MutationObserver((mutations) => {
      if (this.searchToken !== token) { cleanup(); container.scrollTop = savedScrollTop; return; }

      // Check every added node for our target article
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (el.matches(`[role="article"][aria-posinset="${posinset}"]`)) {
            found(el); return;
          }
          const inner = el.querySelector(`[role="article"][aria-posinset="${posinset}"]`);
          if (inner) { found(inner); return; }
        }
      }

      // Target not in this mutation batch — articles were added but not ours.
      // Adjust scroll direction based on what IS visible.
      adjustScroll();
    });

    observer.observe(container, { childList: true, subtree: true });

    // Safety timeout — give up after 10 seconds
    safetyTimer = setTimeout(fail, 10000);

    // Check if article is already in DOM before first scroll
    const existing = document.querySelector(
      `[role="article"][aria-posinset="${posinset}"]`
    ) as HTMLElement | null;
    if (existing) {
      found(existing);
      return;
    }

    // Start binary search with initial scroll
    adjustScroll();
  }

  /**
   * Full scan top-to-bottom for old bookmarks without stored posinset.
   * Re-identifies messages by regenerating stable ID from text content.
   * Always restores scroll position on failure — never corrupts page state.
   */
  private fullScan(
    messageId: string,
    container: HTMLElement,
    token: number
  ): void {
    const savedScrollTop = container.scrollTop;
    const stepSize = 3000;
    const stepDelay = 150;
    let steps = 0;
    const maxSteps = 50;

    const fail = () => {
      if (this.searchToken !== token) return;
      container.scrollTop = savedScrollTop;
      this.showNotFoundAlert();
    };

    container.scrollTop = 0;

    const step = () => {
      if (this.searchToken !== token) { container.scrollTop = savedScrollTop; return; }
      steps++;
      if (steps > maxSteps) { fail(); return; }

      // Check by our attribute
      const el = document.querySelector(
        `[data-message-id="${messageId}"]`
      ) as HTMLElement | null;
      if (el) { this.scrollElementIntoView(el); return; }

      // Re-identify by regenerating stable ID from visible text
      const allArticles = document.querySelectorAll('[role="article"][aria-posinset]');
      for (const article of Array.from(allArticles)) {
        const userMsg = this.getUserMsgFromArticle(article);
        if (userMsg && !userMsg.getAttribute('data-message-id')) {
          const text = userMsg.textContent?.trim().substring(0, 300) || '';
          const generatedId = this.generateStableMessageId('user', text);
          if (generatedId === messageId) {
            userMsg.setAttribute('data-message-id', messageId);
            this.scrollElementIntoView(userMsg);
            return;
          }
        }
      }

      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
        fail();
        return;
      }

      container.scrollTop = Math.min(container.scrollHeight, container.scrollTop + stepSize);
      setTimeout(step, stepDelay);
    };

    step();
  }

  private scrollElementIntoView(element: HTMLElement): void {
    element.style.scrollMarginTop = '100px';
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
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