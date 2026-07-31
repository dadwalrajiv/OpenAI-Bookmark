import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import { Bookmark } from '../types/bookmark';
import { Message } from '../types/platform';

let sidebarRoot: any = null;
let currentConversationId: string | null = null;

export function injectSidebar(
  conversationId: string,
  onBookmarkClick: (bookmark: Bookmark) => void,
  allMessages: Message[],
  onMessageClick: (messageId: string) => void,
  totalInjected?: number   // total bookmark buttons currently in the DOM
) {
  const existing = document.getElementById('ai-bookmarks-sidebar');

  if (existing && currentConversationId === conversationId) {
    if (sidebarRoot) {
      sidebarRoot.render(
        <React.StrictMode>
          <Sidebar
            conversationId={conversationId}
            onBookmarkClick={onBookmarkClick}
            allMessages={allMessages}
            onMessageClick={onMessageClick}
            totalInjected={totalInjected}
          />
        </React.StrictMode>
      );
    }
    return;
  }

  if (existing && currentConversationId !== conversationId) {
    existing.remove();
    sidebarRoot = null;
  }

  const container = document.createElement('div');
  container.id = 'ai-bookmarks-sidebar';
  document.body.appendChild(container);

  currentConversationId = conversationId;

  sidebarRoot = createRoot(container);
  sidebarRoot.render(
    <React.StrictMode>
      <Sidebar
        conversationId={conversationId}
        onBookmarkClick={onBookmarkClick}
        allMessages={allMessages}
        onMessageClick={onMessageClick}
        totalInjected={totalInjected}
      />
    </React.StrictMode>
  );
}
