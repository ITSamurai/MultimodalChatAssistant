import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { Chat } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

interface ChatTitlesContextType {
  refreshChats: () => Promise<void>;
  updateChatTitle: (chatId: number, newTitle: string) => Promise<void>;
  chats: Chat[];
  isLoading: boolean;
}

const ChatTitlesContext = createContext<ChatTitlesContextType | null>(null);

export function ChatTitlesProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refreshInProgress = useRef(false);
  const lastRefreshTime = useRef(0);

  // Function to get all chats with debouncing
  const refreshChats = useCallback(async () => {
    // Prevent concurrent refreshes
    if (refreshInProgress.current) {
      console.log('Refresh already in progress, skipping');
      return;
    }

    // Add debouncing - don't refresh if we just did it recently (within 2 seconds)
    const now = Date.now();
    if (now - lastRefreshTime.current < 2000) {
      console.log('Refresh recently completed, skipping');
      return;
    }

    refreshInProgress.current = true;
    setIsLoading(true);
    
    try {
      const response = await apiRequest('GET', '/api/chats');
      if (response.ok) {
        console.log('Refreshed chats from server');
        const data = await response.json();
        setChats(data);
        lastRefreshTime.current = Date.now();
      } else {
        console.error('Failed to load chats');
      }
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setIsLoading(false);
      refreshInProgress.current = false;
    }
  }, []);

  // Function to update a chat title
  const updateChatTitle = useCallback(async (chatId: number, newTitle: string) => {
    try {
      // Update server
      const response = await apiRequest('PATCH', `/api/chats/${chatId}`, { title: newTitle });
      
      if (response.ok) {
        console.log(`Updated chat title on server: chatId=${chatId}, title="${newTitle}"`);
        
        // Update local state immediately without fetching from server
        setChats(prevChats => prevChats.map(chat => 
          chat.id === chatId ? { ...chat, title: newTitle } : chat
        ));
        
        // Notify components about the change without triggering a refresh
        const event = new CustomEvent('chat-title-changed', { 
          detail: { chatId, newTitle }
        });
        window.dispatchEvent(event);
      }
    } catch (error) {
      console.error('Error updating chat title:', error);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    refreshChats();
    
    // Listen for auth-related events that should trigger a refresh
    const handleAuthEvent = () => {
      console.log('Auth event detected, refreshing chats');
      refreshChats();
    };
    
    window.addEventListener('auth-changed', handleAuthEvent);
    return () => {
      window.removeEventListener('auth-changed', handleAuthEvent);
    };
  }, [refreshChats]);

  return (
    <ChatTitlesContext.Provider value={{ refreshChats, updateChatTitle, chats, isLoading }}>
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