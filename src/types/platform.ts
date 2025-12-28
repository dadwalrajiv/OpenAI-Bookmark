import { Bookmark } from './bookmark';  // Add this import at the top
export interface Message {
  id: string;
  element: HTMLElement;
  text: string;
  role: 'user' | 'assistant';
  timestamp: number;
}

export interface PlatformAdapter {
  name: string;
  detectPlatform(): boolean;
  getMessages(): Message[];
  getConversationId(): string;
  injectBookmarkButton(
    message: Message, 
    onClick: (message: Message) => void, 
    bookmark: Bookmark | null  // CHANGED: was isBookmarked: boolean
  ): void;
  scrollToMessage(messageId: string): void;
}