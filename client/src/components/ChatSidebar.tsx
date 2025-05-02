import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chat } from "@shared/schema";
import { Loader2, MessageSquarePlus, Settings, LogOut } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export function ChatSidebar() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [newChatTitle, setNewChatTitle] = useState<string>("");
  const [isCreatingChat, setIsCreatingChat] = useState<boolean>(false);

  // Fetch user's chats
  const {
    data: chats,
    isLoading,
    error,
  } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
    enabled: !!user,
  });

  // Handle chat creation
  const createChatMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/chats", { title });
      return res.json();
    },
    onSuccess: (newChat: Chat) => {
      // Update the chats list
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      // Navigate to the new chat
      setLocation(`/chat/${newChat.id}`);
      setNewChatTitle("");
      setIsCreatingChat(false);
      toast({
        title: "Chat created",
        description: "Your new chat has been created",
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating chat",
        description: error.message || "Failed to create new chat",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const handleCreateChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatTitle.trim()) return;
    createChatMutation.mutate(newChatTitle);
  };

  return (
    <div className="h-screen flex flex-col w-64 bg-muted/50 border-r p-4">
      {/* User profile section */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b">
        <div className="truncate">
          <h3 className="font-medium truncate">
            {user?.name || user?.username || "User"}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {user?.role === "superadmin" ? "Super Admin" : user?.role || "User"}
          </p>
        </div>
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/config")}
            title="Settings"
          >
            <Settings size={18} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => logoutMutation.mutate()}
            title="Logout"
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <LogOut size={18} />
            )}
          </Button>
        </div>
      </div>
      
      {/* New chat section */}
      <div className="mb-4">
        {isCreatingChat ? (
          <form onSubmit={handleCreateChat} className="flex flex-col gap-2">
            <Input
              placeholder="Chat title"
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button 
                type="submit" 
                size="sm" 
                disabled={createChatMutation.isPending || !newChatTitle.trim()}
              >
                {createChatMutation.isPending && (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                )}
                Create
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setIsCreatingChat(false);
                  setNewChatTitle("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => setIsCreatingChat(true)}
          >
            <MessageSquarePlus size={16} className="mr-2" />
            New Chat
          </Button>
        )}
      </div>
      
      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        <h4 className="font-medium text-sm mb-2">Your Chats</h4>
        {isLoading ? (
          <div className="py-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Error loading chats
          </div>
        ) : chats?.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No chats yet. Create your first chat!
          </div>
        ) : (
          <ul className="space-y-1">
            {chats?.map((chat) => (
              <li key={chat.id}>
                <button
                  className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent group transition-colors ${
                    location === `/chat/${chat.id}` ? "bg-accent" : ""
                  }`}
                  onClick={() => setLocation(`/chat/${chat.id}`)}
                >
                  <div className="font-medium truncate">{chat.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {chat.lastMessageAt 
                      ? formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true }) 
                      : "No messages yet"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* App info */}
      <div className="mt-auto pt-4 border-t text-xs text-muted-foreground">
        <p>RiverMeadow AI Chat</p>
      </div>
    </div>
  );
}