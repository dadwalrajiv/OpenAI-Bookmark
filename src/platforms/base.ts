import { Message, PlatformAdapter } from '../types/platform';

export abstract class BasePlatform implements PlatformAdapter {
  abstract name: string;
  
  abstract detectPlatform(): boolean;
  abstract getMessages(): Message[];
  abstract injectBookmarkButton(message: Message, onClick: (message: Message) => void, isBookmarked: boolean): void;  // ADD isBookmarked param
  abstract scrollToMessage(messageId: string): void;
  abstract getConversationId(): string;
  
  protected extractText(element: HTMLElement): string {
    return element.textContent || '';
  }
}