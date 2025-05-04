import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Layout } from '@/components/Layout';
import { ChatSidebar } from '@/components/ChatSidebar';
import { KnowledgeBaseChat } from '@/components/KnowledgeBaseChat';
import { apiRequest } from '@/lib/queryClient';
import { Chat } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

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
    const handleChatTitleUpdate = () => {
      if (id) {
        loadChat(); // Reload chat to get the latest title
      }
    };
    
    window.addEventListener('chat-title-updated', handleChatTitleUpdate);
    
    return () => {
      window.removeEventListener('chat-title-updated', handleChatTitleUpdate);
    };
  }, [id]);

  return (
    <Layout>
      <div className="flex h-[calc(100vh-64px)]">
        {/* Chat Sidebar - 280px wide */}
        <ChatSidebar className="w-[280px] flex-shrink-0" />
        
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="border-b py-2 px-4">
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
                <div>
                  <h3 className="text-lg font-medium mb-2">No chat selected</h3>
                  <p className="text-muted-foreground">
                    Select an existing chat or create a new one to get started
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}