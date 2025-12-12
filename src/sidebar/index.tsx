import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import { Bookmark } from '../types/bookmark';

let sidebarRoot: any = null;
let currentConversationId: string | null = null;

export function injectSidebar(conversationId: string, onBookmarkClick: (bookmark: Bookmark) => void) {
  // Check if sidebar already exists for this conversation
  const existing = document.getElementById('ai-bookmarks-sidebar');
  
  if (existing && currentConversationId === conversationId) {
    console.log('⏭️  Sidebar already exists for this conversation');
    return;
  }
  
  // Remove old sidebar if conversation changed
  if (existing && currentConversationId !== conversationId) {
    console.log('🔄 Conversation changed, updating sidebar');
    existing.remove();
    sidebarRoot = null;
  }

  // Create sidebar container
  const container = document.createElement('div');
  container.id = 'ai-bookmarks-sidebar';
  document.body.appendChild(container);

  // Store current conversation
  currentConversationId = conversationId;

  // Render React component
  sidebarRoot = createRoot(container);
  sidebarRoot.render(
    <React.StrictMode>
      <Sidebar conversationId={conversationId} onBookmarkClick={onBookmarkClick} />
    </React.StrictMode>
  );

  console.log('✅ Sidebar injected for conversation:', conversationId);
}