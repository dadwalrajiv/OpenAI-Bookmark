import React, { useState, useEffect } from 'react';
import { Bookmark } from '../types/bookmark';
import { Message } from '../types/platform';
import { BookmarkStorage } from '../utils/storage';
import { InputSanitizer } from '../utils/sanitizer';

interface SidebarProps {
  conversationId: string;
  onBookmarkClick: (bookmark: Bookmark) => void;
  allMessages: Message[];      // already filtered to user-only by the caller
  onMessageClick: (messageId: string) => void;
  totalInjected?: number;      // processedMessageIds.size from content scripts — stable, grow-only count
}

type TabType = 'bookmarks' | 'messages';

export const Sidebar: React.FC<SidebarProps> = ({
  conversationId,
  onBookmarkClick,
  allMessages,
  onMessageClick,
  totalInjected,
}) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('bookmarks');

  useEffect(() => {
    loadBookmarks();
    const handleBookmarkAdded = () => { loadBookmarks(); };
    const handleBookmarkDeleted = () => { loadBookmarks(); };
    window.addEventListener('bookmarkAdded', handleBookmarkAdded as EventListener);
    window.addEventListener('bookmarkDeleted', handleBookmarkDeleted);
    return () => {
      window.removeEventListener('bookmarkAdded', handleBookmarkAdded as EventListener);
      window.removeEventListener('bookmarkDeleted', handleBookmarkDeleted);
    };
  }, [conversationId]);

  const navigatingRef = React.useRef(false);

  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (navigatingRef.current) return;
      const sidebar = document.getElementById('ai-bookmarks-sidebar');
      if (sidebar && !sidebar.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  const loadBookmarks = async () => {
    const loaded = await BookmarkStorage.getByConversation(conversationId);
    loaded.sort((a, b) => b.timestamp - a.timestamp);
    setBookmarks(loaded);
  };

  const handleDelete = async (bookmarkId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this bookmark?')) {
      await BookmarkStorage.delete(bookmarkId);
      window.dispatchEvent(new CustomEvent('bookmarkDeleted', { detail: bookmarkId }));
      loadBookmarks();
    }
  };

  // allMessages is already user-only, sorted by the caller.
  // We sort here as a safety net.
  const userMessages = allMessages
    .filter(m => m.role === 'user')
    .sort((a, b) => a.timestamp - b.timestamp);

  // This is the single source of truth for the badge and tab count.
  // allMessages is populated from platform.getMessages() which scans the live DOM
  // on every updateSidebar() call — so it always reflects what's actually on screen.
  const messageCount = totalInjected ?? userMessages.length;

  const filteredBookmarks = bookmarks.filter(b =>
    b.note.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.messageText.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMessages = userMessages.filter(m =>
    m.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Floating Button (Collapsed State) */}
      {!isExpanded && (
        <div
          onClick={() => setIsExpanded(true)}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '48px',
            height: '48px',
            backgroundColor: '#2a2a2a',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease',
            zIndex: 9999,
            border: '2px solid #444',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3a3a3a';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2a2a2a';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <div style={{ fontSize: '22px', lineHeight: '1' }}>📌</div>

          {/* Badge: bookmarks saved / total user messages detected */}
          {(bookmarks.length > 0 || messageCount > 0) && (
            <div style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              backgroundColor: '#4a9eff',
              color: '#fff',
              borderRadius: '12px',
              minWidth: '32px',
              height: '20px',
              padding: '0 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: '700',
              border: '2px solid #2a2a2a',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              whiteSpace: 'nowrap',
            }}>
              {bookmarks.length}/{messageCount}
            </div>
          )}
        </div>
      )}

      {/* Expanded Sidebar */}
      {isExpanded && (
        <div style={{
          position: 'fixed',
          top: '0',
          right: '0',
          height: '100vh',
          width: '340px',
          backgroundColor: '#1a1a1a',
          borderLeft: '1px solid #333',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          boxShadow: '-4px 0 12px rgba(0,0,0,0.3)',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px',
            borderBottom: '1px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#222',
          }}>
            <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
              📌 AI Chat Bookmarks
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '20px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#aaa'; }}
              title="Close sidebar"
            >✕</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #333', backgroundColor: '#1a1a1a' }}>
            <button
              onClick={() => setActiveTab('bookmarks')}
              style={{
                flex: 1, padding: '12px',
                backgroundColor: activeTab === 'bookmarks' ? '#2a2a2a' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'bookmarks' ? '2px solid #4a9eff' : '2px solid transparent',
                color: activeTab === 'bookmarks' ? '#fff' : '#888',
                cursor: 'pointer', fontSize: '13px', fontWeight: '500', transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { if (activeTab !== 'bookmarks') { e.currentTarget.style.backgroundColor = '#222'; e.currentTarget.style.color = '#aaa'; } }}
              onMouseLeave={(e) => { if (activeTab !== 'bookmarks') { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#888'; } }}
            >
              Bookmarks ({bookmarks.length})
            </button>
            <button
              onClick={() => setActiveTab('messages')}
              style={{
                flex: 1, padding: '12px',
                backgroundColor: activeTab === 'messages' ? '#2a2a2a' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'messages' ? '2px solid #4a9eff' : '2px solid transparent',
                color: activeTab === 'messages' ? '#fff' : '#888',
                cursor: 'pointer', fontSize: '13px', fontWeight: '500', transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { if (activeTab !== 'messages') { e.currentTarget.style.backgroundColor = '#222'; e.currentTarget.style.color = '#aaa'; } }}
              onMouseLeave={(e) => { if (activeTab !== 'messages') { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#888'; } }}
            >
              All Messages ({messageCount})
            </button>
          </div>

          {/* Search */}
          {((activeTab === 'bookmarks' && bookmarks.length > 0) ||
            (activeTab === 'messages' && messageCount > 0)) && (
            <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
              <input
                type="text"
                placeholder={activeTab === 'bookmarks' ? 'Search bookmarks...' : 'Search messages...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#fff', fontSize: '13px', outline: 'none' }}
              />
            </div>
          )}

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>

            {/* Bookmarks Tab */}
            {activeTab === 'bookmarks' && (
              <>
                {filteredBookmarks.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '20px 12px', fontSize: '13px', lineHeight: '1.6' }}>
                    {searchQuery ? 'No matching bookmarks' : bookmarks.length === 0 ? (
                      <>
                        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📌</div>
                        <div style={{ color: '#888' }}>No bookmarks yet</div>
                        <div style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>
                          Hover over messages and click 📌 to bookmark important moments
                        </div>
                      </>
                    ) : 'No matching bookmarks'}
                  </div>
                ) : filteredBookmarks.map((bookmark) => (
                  <div
                    key={bookmark.id}
                    onClick={() => { navigatingRef.current = true; onBookmarkClick(bookmark); setTimeout(() => { navigatingRef.current = false; }, 1500); }}
                    style={{ backgroundColor: '#2a2a2a', borderRadius: '6px', padding: '10px', marginBottom: '8px', cursor: 'pointer', border: '1px solid #333', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#333'; e.currentTarget.style.borderColor = '#555'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2a2a2a'; e.currentTarget.style.borderColor = '#333'; }}
                  >
                    {bookmark.note && (
                      <div style={{ color: '#fff', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                        {InputSanitizer.sanitizeForDisplay(bookmark.note)}
                      </div>
                    )}
                    <div style={{ color: '#aaa', fontSize: '12px', lineHeight: '1.4', marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {InputSanitizer.sanitizeForDisplay(bookmark.messageText)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ color: '#666', fontSize: '11px' }}>
                        {new Date(bookmark.timestamp).toLocaleDateString()}
                      </div>
                      <button
                        onClick={(e) => handleDelete(bookmark.id, e)}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px', padding: '2px 6px' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4444'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
                      >🗑️</button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Messages Tab */}
            {activeTab === 'messages' && (
              <>
                {filteredMessages.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '20px 12px', fontSize: '13px', lineHeight: '1.6' }}>
                    {searchQuery ? 'No matching messages' : messageCount === 0 ? (
                      <>
                        <div style={{ fontSize: '32px', marginBottom: '12px' }}>💬</div>
                        <div style={{ color: '#888' }}>No messages yet</div>
                        <div style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>
                          Start a conversation to see your messages here
                        </div>
                      </>
                    ) : 'No matching messages'}
                  </div>
                ) : filteredMessages.map((message) => (
                  <div
                    key={message.id}
                    onClick={() => { navigatingRef.current = true; onMessageClick(message.id); setTimeout(() => { navigatingRef.current = false; }, 1500); }}
                    style={{ backgroundColor: '#2a2a2a', borderRadius: '6px', padding: '10px', marginBottom: '8px', cursor: 'pointer', border: '1px solid #333', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#333'; e.currentTarget.style.borderColor = '#555'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2a2a2a'; e.currentTarget.style.borderColor = '#333'; }}
                  >
                    <div style={{ color: '#aaa', fontSize: '12px', lineHeight: '1.4', marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {InputSanitizer.sanitizeForDisplay(message.text)}
                    </div>
                    <div style={{ color: '#666', fontSize: '11px' }}>
                      {new Date(message.timestamp).toLocaleDateString()}{' '}
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ borderTop: '1px solid #333', padding: '12px', backgroundColor: '#222', textAlign: 'center' }}>
            <div style={{ color: '#888', fontSize: '11px', marginBottom: '8px' }} />
          </div>
        </div>
      )}
    </>
  );
};
