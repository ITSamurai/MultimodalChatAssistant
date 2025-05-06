import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { Chat } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

interface ChatTitlesContextType {
  refreshChats: () => Promise<void>;
  updateChatTitle: (chatId: number, newTitle: string) => Promise<void>;
  chats: Chat[];
  isLoading: boolean;
  // Add a method to force update by id
  forceUpdateChat: (chatId: number) => Promise<void>;
}

const ChatTitlesContext = createContext<ChatTitlesContextType | null>(null);

export function ChatTitlesProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refreshInProgress = useRef(false);
  const lastRefreshTime = useRef(0);
  const forceUpdateQueue = useRef<Set<number>>(new Set());

  // Function to get all chats with debouncing
  const refreshChats = useCallback(async (force = false) => {
    // Prevent concurrent refreshes unless forced
    if (!force && refreshInProgress.current) {
      console.log('Refresh already in progress, skipping');
      return;
    }

    // Add debouncing - don't refresh if we just did it recently (within 1 second) unless forced
    const now = Date.now();
    if (!force && now - lastRefreshTime.current < 1000) {
      console.log('Refresh recently completed, skipping');
      return;
    }

    refreshInProgress.current = true;
    if (chats.length === 0) {
      setIsLoading(true);
    }
    
    try {
      const response = await apiRequest('GET', '/api/chats');
      if (response.ok) {
        console.log('Refreshed chats from server');
        const data = await response.json();
        
        // If we have chat data, log it
        if (data && Array.isArray(data)) {
          if (data.length > 0) {
            console.log(`Server returned ${data.length} chats:`, 
              data.map((c: Chat) => `id:${c.id}, title:"${c.title}"`).join(', '));
          } else {
            console.log('Server returned empty chat list');
          }
          
          // Set the chats regardless of whether it's empty or not
          setChats(data);
        } else {
          console.error('Invalid chat data received:', data);
        }
        
        lastRefreshTime.current = Date.now();
        // Clear any pending forceUpdate requests
        forceUpdateQueue.current.clear();
      } else {
        console.error('Failed to load chats:', await response.text());
      }
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setIsLoading(false);
      refreshInProgress.current = false;
    }
  }, []);

  // Function to force update a specific chat by ID
  const forceUpdateChat = useCallback(async (chatId: number) => {
    try {
      console.log(`Force updating chat ${chatId}`);
      
      // Add to queue and process after a short delay to batch requests
      forceUpdateQueue.current.add(chatId);
      
      // After a short delay, refresh the chat if it's still in the queue
      setTimeout(async () => {
        if (forceUpdateQueue.current.has(chatId)) {
          const response = await apiRequest('GET', `/api/chats/${chatId}`);
          if (response.ok) {
            const chat = await response.json();
            console.log(`Directly fetched updated chat: id=${chatId}, title="${chat.title}"`);
            
            // Update just this one chat in the list
            setChats(prevChats => {
              const updated = prevChats.map(c => 
                c.id === chatId ? chat : c
              );
              return updated;
            });
            
            // Remove from queue
            forceUpdateQueue.current.delete(chatId);
          }
        }
      }, 300);
    } catch (error) {
      console.error(`Error force updating chat ${chatId}:`, error);
    }
  }, []);

  // Function to update a chat title
  const updateChatTitle = useCallback(async (chatId: number, newTitle: string) => {
    try {
      console.log(`Updating chat title in context: chatId=${chatId}, title="${newTitle}"`);
      
      // Update server
      const response = await apiRequest('PATCH', `/api/chats/${chatId}`, { title: newTitle });
      
      if (response.ok) {
        // Update local state immediately
        setChats(prevChats => prevChats.map(chat => 
          chat.id === chatId ? { ...chat, title: newTitle } : chat
        ));
        
        // For debugging - log current state
        setTimeout(() => {
          console.log('Updated chats state:', 
            chats.map(c => `id:${c.id}, title:"${c.title}"`).join(', '));
        }, 50);
        
        // Notify components about the change
        window.dispatchEvent(new CustomEvent('chat-title-changed', { 
          detail: { chatId, newTitle }
        }));
        
        return; // Success!
      }
    } catch (error) {
      console.error('Error updating chat title:', error);
    }
    
    // If we get here, something went wrong - try to force refresh the chat
    setTimeout(() => forceUpdateChat(chatId), 500);
  }, [forceUpdateChat, chats]);

  // Load initial data
  useEffect(() => {
    refreshChats();
    
    // Listen for auth-related events that should trigger a refresh
    const handleAuthEvent = () => {
      console.log('Auth event detected, refreshing chats');
      refreshChats(true); // Force refresh on auth change
    };
    
    window.addEventListener('auth-changed', handleAuthEvent);
    return () => {
      window.removeEventListener('auth-changed', handleAuthEvent);
    };
  }, [refreshChats]);

  return (
    <ChatTitlesContext.Provider value={{ 
      refreshChats, 
      updateChatTitle, 
      forceUpdateChat,
      chats, 
      isLoading 
    }}>
      {children}
    </ChatTitlesContext.Provider>
  );
}

export function useChatTitles() {
  const context = useContext(ChatTitlesContext);
  if (!context) {
    throw new Error('useChatTitles must be used within a ChatTitlesProvider');
  }
  return context;
}