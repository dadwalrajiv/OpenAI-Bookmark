export interface Bookmark {
  id: string;
  platform: string;           // 'claude' | 'chatgpt'
  conversationId: string;
  messageId: string;
  messageText: string;
  note: string;
  tags: string[];
  timestamp: number;
  url: string;
}