import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { KnowledgeBaseChat } from '@/components/KnowledgeBaseChat';
import { Button } from '@/components/ui/button';
import { PlusCircle, LogOut, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { 
  createChat, 
  getUserChats, 
  getChatMessages, 
  Chat as ChatType,
  ChatMessage
} from '@/lib/api';
import { useQuery, useMutation } from '@tanstack/react-query';

export default function ChatPage() {
  const { user, logoutMutation } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Check authentication
  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  // Fetch all user chats
  const { 
    data: chats = [], 
    isLoading: isLoadingChats,
    refetch: refetchChats
  } = useQuery({
    queryKey: ['/api/chats'],
    queryFn: getUserChats,
    enabled: !!user
  });

  // Create a new chat mutation
  const createChatMutation = useMutation({
    mutationFn: createChat,
    onSuccess: (newChat) => {
      setActiveChatId(newChat.id.toString());
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      toast({
        title: 'Chat created',
        description: 'New chat started successfully.'
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to create new chat.',
        variant: 'destructive'
      });
    }
  });

  // Fetch messages for the active chat
  const { 
    data: chatHistoryMessages = [],
    isLoading: isLoadingChatHistory,
    refetch: refetchMessages
  } = useQuery({
    queryKey: ['/api/chats', activeChatId, 'messages'],
    queryFn: () => getChatMessages(parseInt(activeChatId!, 10)),
    enabled: !!activeChatId
  });
  
  // Update chat messages when the query data changes
  useEffect(() => {
    if (chatHistoryMessages && chatHistoryMessages.length > 0) {
      setChatMessages(chatHistoryMessages);
    }
  }, [chatHistoryMessages]);

  // Log out handler
  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      queryClient.clear();
      navigate('/auth');
    } catch (error) {
      toast({
        title: 'Logout failed',
        description: 'Failed to log out. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Start a new chat
  const startNewChat = () => {
    createChatMutation.mutate('New Chat');
  };

  // Update chat history
  const updateChatHistory = (chatId: string, messages: ChatMessage[]) => {
    setChatMessages(messages);
    // No need to update the local state manually, we'll refetch on next message
    setTimeout(() => refetchMessages(), 500);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">RiverMeadow AI</h2>
          <p className="text-sm text-muted-foreground">
            Logged in as {user?.username}
          </p>
        </div>
        
        <div className="p-4">
          <Button 
            onClick={startNewChat} 
            className="w-full justify-start"
            variant="outline"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New Chat
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {/* Chat list */}
          {isLoadingChats ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center p-4 text-muted-foreground">
              No chats yet. Start a new conversation!
            </div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                className={`p-3 rounded-md mb-1 cursor-pointer hover:bg-muted ${
                  chat.id.toString() === activeChatId ? 'bg-muted' : ''
                }`}
                onClick={() => setActiveChatId(chat.id.toString())}
              >
                <div className="font-medium truncate">
                  {chat.title || 'New Chat'}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {new Date(chat.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="p-4 border-t mt-auto">
          <div className="space-y-2">
            <Button 
              onClick={() => navigate('/config')}
              variant="ghost" 
              className="w-full justify-start text-muted-foreground"
            >
              <svg 
                className="mr-2 h-4 w-4" 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Settings
            </Button>
            
            <Button 
              onClick={handleLogout}
              variant="ghost" 
              className="w-full justify-start text-muted-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b p-4">
          <h1 className="text-xl font-bold">RiverMeadow Knowledge Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Ask questions or request diagrams about RiverMeadow and cloud migration
          </p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {activeChatId ? (
            <KnowledgeBaseChat
              chatId={activeChatId}
              onUpdateChatHistory={(messages) => updateChatHistory(activeChatId, messages)}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">No Active Chat</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Start a new chat to begin asking questions and generating diagrams
                </p>
                <Button onClick={startNewChat}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Start New Chat
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}