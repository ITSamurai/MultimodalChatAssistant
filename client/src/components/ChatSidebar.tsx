import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  PlusCircle, 
  MessageSquare, 
  Trash, 
  Edit2,
  MoreVertical, 
  Check, 
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useChatTitles } from '@/hooks/use-chat-titles';
import { apiRequest } from '@/lib/queryClient';
import { Chat } from '@shared/schema';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface ChatSidebarProps {
  className?: string;
}

export function ChatSidebar({ className }: ChatSidebarProps) {
  const { user } = useAuth();
  const [_, setLocation] = useLocation();
  const { chats, isLoading, refreshChats, updateChatTitle } = useChatTitles();
  const [editingChatId, setEditingChatId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const { toast } = useToast();

  // Load chats for the current user initially
  useEffect(() => {
    if (user) {
      console.log("User changed, refreshing chats");
      refreshChats();
    }
  }, [user, refreshChats]);
  
  // Listen for chat title update events
  useEffect(() => {
    // Listen for the 'chat-title-changed' event from our context
    const handleChatTitleChanged = (event: Event) => {
      console.log('Received chat-title-changed event, refreshing chats');
      refreshChats();
    };

    // Also handle the older event types for backwards compatibility
    window.addEventListener('chat-title-updated', handleChatTitleChanged);
    window.addEventListener('chat-title-changed', handleChatTitleChanged);
    window.addEventListener('reload-chats', handleChatTitleChanged);
    
    return () => {
      window.removeEventListener('chat-title-updated', handleChatTitleChanged);
      window.removeEventListener('chat-title-changed', handleChatTitleChanged);
      window.removeEventListener('reload-chats', handleChatTitleChanged);
    };
  }, [refreshChats]);

  const createNewChat = async () => {
    if (!user) return;
    
    try {
      const response = await apiRequest('POST', '/api/chats', {
        title: 'New Conversation',
        userId: user.id
      });
      
      if (response.ok) {
        const newChat = await response.json();
        setLocation(`/chat/${newChat.id}`);
        
        // Refresh chats via context
        refreshChats();
        
        toast({
          title: 'New chat created',
          description: 'Started a new conversation',
        });
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to create a new chat',
        variant: 'destructive',
      });
    }
  };

  const deleteChat = async (chatId: number) => {
    try {
      const response = await apiRequest('DELETE', `/api/chats/${chatId}`);
      
      if (response.ok) {
        setLocation('/chat');
        
        // Refresh chats via context
        refreshChats();
        
        toast({
          title: 'Chat deleted',
          description: 'The conversation has been removed',
        });
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete the chat',
        variant: 'destructive',
      });
    }
  };

  const startEditingChat = (chat: Chat) => {
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const saveEditedChat = async (chatId: number) => {
    if (!editTitle.trim()) {
      setEditingChatId(null);
      setEditTitle('');
      return;
    }
    
    try {
      // Use our context's updateChatTitle function
      await updateChatTitle(chatId, editTitle);
      
      toast({
        title: 'Chat updated',
        description: 'Chat name has been updated',
      });
    } catch (error) {
      console.error('Error updating chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to update the chat',
        variant: 'destructive',
      });
    } finally {
      setEditingChatId(null);
      setEditTitle('');
    }
  };

  const cancelEditing = () => {
    setEditingChatId(null);
    setEditTitle('');
  };

  return (
    <div className={`flex flex-col h-full border-r ${className || ''}`}>
      <div className="p-4 border-b">
        <Button 
          className="w-full flex items-center justify-center gap-2"
          onClick={createNewChat}
        >
          <PlusCircle className="h-4 w-4" />
          New Chat
        </Button>
      </div>
      
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2 pr-2">
          {isLoading ? (
            // Loading skeletons
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-center p-2 space-x-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))
          ) : chats.length === 0 ? (
            <div className="text-center p-4 text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            chats.map(chat => (
              <div 
                key={chat.id}
                className="group flex items-center justify-between p-2 hover:bg-accent rounded-md cursor-pointer"
              >
                {editingChatId === chat.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-8"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => saveEditedChat(chat.id)}
                      className="h-6 w-6"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={cancelEditing}
                      className="h-6 w-6"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div 
                      className="flex items-center flex-1 gap-2"
                      onClick={() => setLocation(`/chat/${chat.id}`)}
                    >
                      <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate max-w-[160px] overflow-hidden text-ellipsis" title={chat.title}>{chat.title}</span>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuItem onClick={() => startEditingChat(chat)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteChat(chat.id)}
                        >
                          <Trash className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}