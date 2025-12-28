import { Message, PlatformAdapter } from '../types/platform';
import { Bookmark } from '../types/bookmark';

export abstract class BasePlatform implements PlatformAdapter {
  abstract name: string;
  abstract detectPlatform(): boolean;
  abstract getMessages(): Message[];
  abstract getConversationId(): string;
  abstract injectBookmarkButton(
    message: Message, 
    onClick: (message: Message) => void, 
    bookmark: Bookmark | null
  ): void;
  abstract scrollToMessage(messageId: string): void;
  // REMOVED: duplicate getConversationId() declaration
  
  protected extractText(element: HTMLElement): string {
    return element.textContent || '';
  }
}