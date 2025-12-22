import React, { useState, useEffect } from 'react';
import { Bookmark } from '../types/bookmark';
import { BookmarkStorage } from '../utils/storage';
import { InputSanitizer } from '../utils/sanitizer';

interface SidebarProps {
  conversationId: string;
  onBookmarkClick: (bookmark: Bookmark) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ conversationId, onBookmarkClick }) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    console.log('🎨 Sidebar mounted for conversation:', conversationId);
    loadBookmarks();
    
    const handleBookmarkAdded = (event: Event) => {
      console.log('📢 Sidebar received bookmarkAdded event', event);
      loadBookmarks();
    };
    
    window.addEventListener('bookmarkAdded', handleBookmarkAdded as EventListener);
    
    const handleBookmarkDeleted = () => {
      console.log('📢 Sidebar received bookmarkDeleted event');
      loadBookmarks();
    };
    
    window.addEventListener('bookmarkDeleted', handleBookmarkDeleted);
    
    return () => {
      window.removeEventListener('bookmarkAdded', handleBookmarkAdded as EventListener);
      window.removeEventListener('bookmarkDeleted', handleBookmarkDeleted);
    };
  }, [conversationId]);

  const loadBookmarks = async () => {
  console.log('🔄 Sidebar loading bookmarks for:', conversationId);
  const loaded = await BookmarkStorage.getByConversation(conversationId);
  loaded.sort((a, b) => b.timestamp - a.timestamp);
  
  // DEBUG: Log all bookmark details
  console.log(`📚 Loaded ${loaded.length} bookmarks:`);
  loaded.forEach((b, i) => {
    console.log(`\n  Bookmark ${i + 1}:`);
    console.log(`    ID: ${b.id}`);
    console.log(`    MessageID: ${b.messageId}`);
    console.log(`    Note: ${b.note}`);
    console.log(`    Text: ${b.messageText.substring(0, 50)}...`);
  });
  
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
  

  const filteredBookmarks = bookmarks.filter(b => 
    b.note.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.messageText.toLowerCase().includes(searchQuery.toLowerCase())
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
            width: '60px',
            height: '60px',
            backgroundColor: '#2a2a2a',
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'all 0.3s ease',
            zIndex: 9999,
            border: '2px solid #444',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3a3a3a';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2a2a2a';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <div style={{ fontSize: '24px' }}>📌</div>
          {bookmarks.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              backgroundColor: '#4a9eff',
              color: '#fff',
              borderRadius: '12px',
              padding: '2px 6px',
              fontSize: '11px',
              fontWeight: '600',
              minWidth: '20px',
              textAlign: 'center',
              border: '2px solid #2a2a2a',
            }}>
              {bookmarks.length}
            </div>
          )}          
        
        
        </div>
      )}

      {/* Expanded Sidebar */}
      {isExpanded && (
        <div
          style={{
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
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px',
              borderBottom: '1px solid #333',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#222',
            }}
          >
            <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
              📌 Bookmarks ({bookmarks.length})
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#aaa',
                cursor: 'pointer',
                fontSize: '20px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#aaa';
              }}
              title="Close sidebar"
            >
              ✕
            </button>
          </div>

          {/* Search */}
          {bookmarks.length > 0 && (
            <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
              <input
                type="text"
                placeholder="Search bookmarks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Bookmarks List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px',
            }}
          >
            {filteredBookmarks.length === 0 ? (
              <div
                style={{
                  color: '#666',
                  textAlign: 'center',
                  padding: '20px 12px',
                  fontSize: '13px',
                  lineHeight: '1.6',
                }}
              >
                {searchQuery ? (
                  'No matching bookmarks'
                ) : bookmarks.length === 0 ? (
                  <>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📌</div>
                    <div style={{ color: '#888' }}>No bookmarks yet</div>
                    <div style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>
                      Hover over messages and click 📌 to bookmark important moments
                    </div>
                  </>
                ) : (
                  'No matching bookmarks'
                )}
              </div>
            ) : (
              filteredBookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  onClick={() => onBookmarkClick(bookmark)}
                  style={{
                    backgroundColor: '#2a2a2a',
                    borderRadius: '6px',
                    padding: '10px',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    border: '1px solid #333',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#333';
                    e.currentTarget.style.borderColor = '#555';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#2a2a2a';
                    e.currentTarget.style.borderColor = '#333';
                  }}
                >
                  {bookmark.note && (
                    <div
                      style={{
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: '500',
                        marginBottom: '6px',
                      }}
                    >
                      {InputSanitizer.sanitizeForDisplay(bookmark.note)}
                    </div>
                  )}

                  <div
                    style={{
                      color: '#aaa',
                      fontSize: '12px',
                      lineHeight: '1.4',
                      marginBottom: '6px',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {InputSanitizer.sanitizeForDisplay(bookmark.messageText)}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        color: '#666',
                        fontSize: '11px',
                      }}
                    >
                      {new Date(bookmark.timestamp).toLocaleDateString()}
                    </div>
                    <button
                      onClick={(e) => handleDelete(bookmark.id, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#888',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: '2px 6px',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ff4444';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#888';
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

         
          <div
            style={{
              borderTop: '1px solid #333',
              padding: '12px',
              backgroundColor: '#222',
              textAlign: 'center',
            }}
          >
            <div style={{
              color: '#888',
              fontSize: '11px',
              marginBottom: '8px',
            }}>
              
            </div>
           
          </div>
        </div>
      )}
    </>
  );
};