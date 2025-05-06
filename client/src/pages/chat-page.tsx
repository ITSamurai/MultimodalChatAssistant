import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Layout } from '@/components/Layout';
import { ChatSidebar } from '@/components/ChatSidebar';
import { KnowledgeBaseChat } from '@/components/KnowledgeBaseChat';
import { apiRequest } from '@/lib/queryClient';
import { Chat } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ChatPage() {
  const { id } = useParams<{ id?: string }>();
  const [chat, setChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Function to load chat data
  const loadChat = async () => {
    if (!id) return;
    
    setIsLoading(true);
    try {
      const response = await apiRequest('GET', `/api/chats/${id}`);
      if (response.ok) {
        const chatData = await response.json();
        setChat(chatData);
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.message || 'Failed to load chat',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading chat:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load chat data if we have a chat ID
  useEffect(() => {
    loadChat();
  }, [id, toast]);

  // Listen for chat title updates
  useEffect(() => {
    // Handle global refresh event (from other components)
    const handleChatTitleUpdate = (event: Event) => {
      if (!id) return;
      
      // Check if the event has details
      const customEvent = event as CustomEvent<{chatId: number, newTitle: string}>;
      if (customEvent.detail && parseInt(id) === customEvent.detail.chatId) {
        // Directly update the chat title in state
        setChat(prevChat => {
          if (!prevChat) return null;
          return {
            ...prevChat,
            title: customEvent.detail.newTitle
          };
        });
      } else {
        // Fallback to reload if event doesn't have details or is for a different chat
        loadChat();
      }
    };
    
    // Handle local title update (immediate UI update without server refetch)
    const handleLocalChatTitleUpdate = (event: Event) => {
      if (!id) return;
      
      const customEvent = event as CustomEvent<{chatId: number, newTitle: string}>;
      if (customEvent.detail && parseInt(id) === customEvent.detail.chatId) {
        // Directly update the chat title in state without refetching
        setChat(prevChat => {
          if (!prevChat) return null;
          return {
            ...prevChat,
            title: customEvent.detail.newTitle
          };
        });
      }
    };
    
    window.addEventListener('chat-title-updated', handleChatTitleUpdate);
    window.addEventListener('chat-title-updated-local', handleLocalChatTitleUpdate);
    
    return () => {
      window.removeEventListener('chat-title-updated', handleChatTitleUpdate);
      window.removeEventListener('chat-title-updated-local', handleLocalChatTitleUpdate);
    };
  }, [id]);

  return (
    <Layout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Chat Sidebar - always visible */}
        <div className="w-[280px] border-r bg-background flex-shrink-0 h-full">
          <ChatSidebar className="h-full" />
        </div>
        
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="border-b py-2 px-4 bg-background">
            <h1 className="text-xl font-semibold">
              {isLoading ? (
                <span className="flex items-center">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </span>
              ) : chat ? (
                chat.title
              ) : (
                id ? 'Chat not found' : 'Select or create a chat'
              )}
            </h1>
          </div>
          
          {/* Chat Content */}
          <div className="flex-1 overflow-hidden">
            {id ? (
              <KnowledgeBaseChat chatId={parseInt(id)} />
            ) : (
              <div className="flex items-center justify-center h-full text-center p-4">
                <div className="max-w-md mx-auto">
                  <h3 className="text-2xl font-bold mb-4">Welcome to RiverMeadow AI Chat</h3>
                  <p className="text-muted-foreground mb-6">
                    Create a new chat or select an existing conversation to start interacting with the AI assistant.
                  </p>
                  <div className="flex flex-col items-center space-y-4">
                    <Button 
                      onClick={() => {
                        const createChatEvent = new Event('create-new-chat');
                        window.dispatchEvent(createChatEvent);
                      }}
                      size="lg"
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <PlusCircle className="h-5 w-5" />
                      Start New Conversation
                    </Button>
                    <p className="text-sm text-muted-foreground mt-2">
                      You can ask questions about documents, request diagrams, or get information about cloud migration.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}