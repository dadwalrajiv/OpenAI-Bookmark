export interface Bookmark {
  id: string;
  platform: string;
  conversationId: string;
  messageId: string;
  messageText: string;
  note: string;
  tags: string[];
  timestamp: number;
  url: string;
  // Platform-specific position data for reliable scroll navigation.
  // Stored at bookmark-save time while the element is in the DOM.
  posinset?: number;    // Claude: aria-posinset of the article
  turnNumber?: number;  // ChatGPT: conversation-turn-N number
}