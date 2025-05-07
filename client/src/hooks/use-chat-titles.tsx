import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// Define chat interface
interface Chat {
  id: number;
  userId: number;
  title: string;
  createdAt: string;
}

// Context type
interface ChatTitlesContextType {
  chats: Chat[];
  isLoading: boolean;
  error: Error | null;
  selectedChatId: number | null;
  setSelectedChatId: (id: number | null) => void;
  createChatMutation: any;
  updateChatTitleMutation: any;
  deleteChatMutation: any;
}

// Create the context
const ChatTitlesContext = createContext<ChatTitlesContextType | null>(null);

// Provider component
export function ChatTitlesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  
  // Fetch all chats for the current user
  const {
    data: chats = [],
    error,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['/api/chats'],
    queryFn: async () => {
      if (!user) return [];
      
      try {
        const response = await apiRequest<Chat[]>('GET', '/api/chats');
        if (!response.ok) {
          throw new Error('Failed to fetch chats');
        }
        return await response.json();
      } catch (error) {
        console.error('Error fetching chats:', error);
        return [];
      }
    },
    enabled: !!user, // Only run if user is logged in
  });
  
  // Set first chat as selected if none is selected
  useEffect(() => {
    if (chats.length > 0 && selectedChatId === null) {
      setSelectedChatId(chats[0].id);
    }
  }, [chats, selectedChatId]);
  
  // Create a new chat
  const createChatMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest('POST', '/api/chats', { title });
      if (!response.ok) {
        throw new Error('Failed to create chat');
      }
      return await response.json();
    },
    onSuccess: (newChat: Chat) => {
      // Update the cache
      queryClient.setQueryData<Chat[]>(['/api/chats'], (old = []) => [...old, newChat]);
      
      // Select the new chat
      setSelectedChatId(newChat.id);
      
      toast({
        title: 'Chat Created',
        description: 'New conversation started',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create chat',
        variant: 'destructive',
      });
    },
  });
  
  // Update a chat title
  const updateChatTitleMutation = useMutation({
    mutationFn: async ({ chatId, title }: { chatId: number; title: string }) => {
      const response = await apiRequest('PATCH', `/api/chats/${chatId}`, { title });
      if (!response.ok) {
        throw new Error('Failed to update chat title');
      }
      return await response.json();
    },
    onSuccess: (updatedChat: Chat) => {
      // Update the cache
      queryClient.setQueryData<Chat[]>(['/api/chats'], (old = []) => 
        old.map(chat => chat.id === updatedChat.id ? updatedChat : chat)
      );
      
      toast({
        title: 'Chat Updated',
        description: 'Conversation title has been updated',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update chat title',
        variant: 'destructive',
      });
    },
  });
  
  // Delete a chat
  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: number) => {
      const response = await apiRequest('DELETE', `/api/chats/${chatId}`);
      if (!response.ok) {
        throw new Error('Failed to delete chat');
      }
      return chatId;
    },
    onSuccess: (deletedChatId: number) => {
      // Update the cache
      queryClient.setQueryData<Chat[]>(['/api/chats'], (old = []) => 
        old.filter(chat => chat.id !== deletedChatId)
      );
      
      // If the deleted chat was selected, select another chat
      if (selectedChatId === deletedChatId) {
        const remainingChats = chats.filter(chat => chat.id !== deletedChatId);
        if (remainingChats.length > 0) {
          setSelectedChatId(remainingChats[0].id);
        } else {
          setSelectedChatId(null);
        }
      }
      
      toast({
        title: 'Chat Deleted',
        description: 'Conversation has been deleted',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete chat',
        variant: 'destructive',
      });
    },
  });
  
  return (
    <ChatTitlesContext.Provider
      value={{
        chats,
        isLoading,
        error: error as Error,
        selectedChatId,
        setSelectedChatId,
        createChatMutation,
        updateChatTitleMutation,
        deleteChatMutation,
      }}
    >
      {children}
    </ChatTitlesContext.Provider>
  );
}

// Hook to use the context
export function useChatTitles() {
  const context = useContext(ChatTitlesContext);
  if (!context) {
    throw new Error('useChatTitles must be used within a ChatTitlesProvider');
  }
  return context;
}