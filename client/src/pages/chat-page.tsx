import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { KnowledgeBaseChat } from '@/components/KnowledgeBaseChat';
import { Button } from '@/components/ui/button';
import { PlusCircle, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  references?: Array<{
    type: string;
    imagePath: string;
    caption: string;
    content: string;
  }>;
}

export default function ChatPage() {
  const { user, logoutMutation } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<Record<string, ChatMessage[]>>({});

  // Check authentication
  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

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
    const newChatId = `chat-${Date.now()}`;
    setActiveChatId(newChatId);
    setChatHistory(prev => ({
      ...prev,
      [newChatId]: []
    }));
  };

  // Update chat history
  const updateChatHistory = (chatId: string, messages: ChatMessage[]) => {
    setChatHistory(prev => ({
      ...prev,
      [chatId]: messages
    }));
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
          {Object.keys(chatHistory).map(chatId => (
            <div
              key={chatId}
              className={`p-3 rounded-md mb-1 cursor-pointer hover:bg-muted ${
                chatId === activeChatId ? 'bg-muted' : ''
              }`}
              onClick={() => setActiveChatId(chatId)}
            >
              <div className="font-medium truncate">
                {chatHistory[chatId][0]?.content.substring(0, 30) || 'New Chat'}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {new Date().toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t mt-auto">
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