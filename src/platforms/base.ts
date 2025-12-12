import { Message, PlatformAdapter } from '../types/platform';

export abstract class BasePlatform implements PlatformAdapter {
  abstract name: string;
  
  abstract detectPlatform(): boolean;
  abstract getMessages(): Message[];
  abstract getConversationId(): string;
  abstract injectBookmarkButton(message: Message, onClick: (message: Message) => void): void;
  abstract scrollToMessage(messageId: string): void;
  
  // Common utility methods
  protected generateMessageId(element: HTMLElement): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  protected extractText(element: HTMLElement): string {
    return element.innerText || element.textContent || '';
  }
}