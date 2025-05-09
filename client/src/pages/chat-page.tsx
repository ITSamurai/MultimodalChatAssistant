import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { KnowledgeBaseChat } from '@/components/KnowledgeBaseChat';
import { Button } from '@/components/ui/button';
import { 
  PlusCircle, 
  LogOut, 
  Loader2, 
  Trash2, 
  MoreVertical,
  Pencil
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { 
  createChat, 
  getUserChats, 
  getChatMessages, 
  updateChatTitle,
  deleteChat,
  Chat as ChatType,
  ChatMessage
} from '@/lib/api';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ChatPage() {
  const { user, logoutMutation } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatToDelete, setChatToDelete] = useState<number | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState<string>("");

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
    
    // Update chat title based on first user message if title is still "New Chat"
    const chat = chats.find(c => c.id.toString() === chatId);
    if (chat && chat.title === 'New Chat' && messages.length >= 2) {
      // Find the first user message
      const firstUserMessage = messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        // Create a shorter title - only 15 characters
        const title = firstUserMessage.content.slice(0, 15) + (firstUserMessage.content.length > 15 ? '...' : '');
        updateChatTitleMutation.mutate({ chatId: parseInt(chatId, 10), title });
      }
    }
  };
  
  // Delete chat mutation
  const deleteChatMutation = useMutation({
    mutationFn: (chatId: number) => deleteChat(chatId),
    onSuccess: () => {
      // If the deleted chat was active, clear the active chat
      if (chatToDelete && activeChatId === chatToDelete.toString()) {
        setActiveChatId(null);
      }
      
      // Refresh the chat list
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      
      toast({
        title: 'Chat deleted',
        description: 'Chat has been deleted successfully.'
      });
      
      // Reset the deletion state
      setChatToDelete(null);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete chat.',
        variant: 'destructive'
      });
      setChatToDelete(null);
    }
  });
  
  // Update chat title mutation
  const updateChatTitleMutation = useMutation({
    mutationFn: ({ chatId, title }: { chatId: number, title: string }) => updateChatTitle(chatId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      setIsEditingTitle(null);
      setNewTitle("");
      
      toast({
        title: 'Title updated',
        description: 'Chat title has been updated.'
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update chat title.',
        variant: 'destructive'
      });
      setIsEditingTitle(null);
    }
  });
  
  // Handle chat deletion
  const handleDeleteChat = (chatId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the chat from being selected
    setChatToDelete(chatId);
  };
  
  // Confirm chat deletion
  const confirmDeleteChat = () => {
    if (chatToDelete) {
      deleteChatMutation.mutate(chatToDelete);
    }
  };
  
  // Cancel chat deletion
  const cancelDeleteChat = () => {
    setChatToDelete(null);
  };
  
  // Start editing a chat title
  const startEditingTitle = (chatId: number, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the chat from being selected
    setIsEditingTitle(chatId);
    setNewTitle(currentTitle);
  };
  
  // Submit updated title
  const submitNewTitle = (chatId: number, e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim()) {
      updateChatTitleMutation.mutate({ chatId, title: newTitle.trim() });
    } else {
      setIsEditingTitle(null);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Delete confirmation dialog */}
      <AlertDialog open={chatToDelete !== null} onOpenChange={() => setChatToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this chat and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteChat}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteChat} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    
      {/* Sidebar */}
      <div className="w-64 border-r flex flex-col sidebar">
        <div className="p-4 border-b app-header">
          <p className="text-sm text-white">
            {user?.username}
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
                className={`chat-list-item cursor-pointer ${
                  chat.id.toString() === activeChatId ? 'active' : ''
                }`}
                onClick={() => setActiveChatId(chat.id.toString())}
              >
                {isEditingTitle === chat.id ? (
                  <form 
                    onSubmit={(e) => submitNewTitle(chat.id, e)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center"
                  >
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="flex-1 p-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                    />
                    <Button 
                      type="submit" 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 w-6 p-0 ml-1"
                    >
                      <svg 
                        className="h-3 w-3" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M5 13l4 4L19 7" 
                        />
                      </svg>
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-start justify-between group">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {chat.title || 'New Chat'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {new Date(chat.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem 
                          onClick={(e) => startEditingTitle(chat.id, chat.title, e)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => handleDeleteChat(chat.id, e)}
                          className="text-red-500 focus:text-red-500"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
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
        <div className="border-b p-2">
          {/* Header removed as requested */}
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