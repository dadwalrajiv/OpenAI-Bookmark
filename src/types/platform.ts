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
  injectBookmarkButton(message: Message, onClick: (message: Message) => void, isBookmarked: boolean): void;  // ADD isBookmarked param
  scrollToMessage(messageId: string): void;
  getConversationId(): string;
}