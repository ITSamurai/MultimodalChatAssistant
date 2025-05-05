import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  // Function to get all chats
  const refreshChats = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('GET', '/api/chats');
      if (response.ok) {
        console.log('Refreshed chats from server');
        const data = await response.json();
        setChats(data);
      } else {
        console.error('Failed to load chats');
      }
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to update a chat title
  const updateChatTitle = async (chatId: number, newTitle: string) => {
    try {
      // Update server
      const response = await apiRequest('PATCH', `/api/chats/${chatId}`, { title: newTitle });
      
      if (response.ok) {
        console.log(`Updated chat title on server: chatId=${chatId}, title="${newTitle}"`);
        // Update local state
        setChats(prevChats => prevChats.map(chat => 
          chat.id === chatId ? { ...chat, title: newTitle } : chat
        ));
        
        // Notify components about the change
        const event = new CustomEvent('chat-title-changed', { 
          detail: { chatId, newTitle }
        });
        window.dispatchEvent(event);
      }
    } catch (error) {
      console.error('Error updating chat title:', error);
    }
  };

  // Load initial data
  useEffect(() => {
    refreshChats();
  }, []);

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