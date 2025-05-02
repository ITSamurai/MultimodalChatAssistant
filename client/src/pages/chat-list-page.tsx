import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChatSidebar } from "@/components/ChatSidebar";
import { useAuth } from "@/hooks/use-auth";
import { Chat } from "@shared/schema";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export default function ChatListPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Fetch user's chats
  const {
    data: chats,
    isLoading,
    error,
  } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
    enabled: !!user,
  });

  // Redirect to first chat if available
  useEffect(() => {
    if (chats && chats.length > 0) {
      setLocation(`/chat/${chats[0].id}`);
    }
  }, [chats, setLocation]);

  return (
    <div className="flex h-screen">
      <ChatSidebar />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Your Conversations</h1>
            <p className="text-muted-foreground">
              Access your chats or start a new conversation
            </p>
          </header>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </div>
          ) : error ? (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle>Error Loading Chats</CardTitle>
                <CardDescription>
                  There was a problem loading your chats. Please try again.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : chats?.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <MessageSquarePlus size={32} className="text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Chats Yet</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Start your first conversation to begin using the AI assistant.
              </p>
              <Button
                size="lg"
                onClick={() => {
                  // Create a new chat with a default title
                  // We'll handle this on the sidebar directly
                  document.querySelector("button")?.click();
                }}
              >
                <MessageSquarePlus size={16} className="mr-2" />
                Start New Chat
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {chats?.map((chat) => (
                <Card 
                  key={chat.id} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setLocation(`/chat/${chat.id}`)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg truncate">{chat.title}</CardTitle>
                    <CardDescription>
                      {chat.lastMessageAt 
                        ? formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true }) 
                        : "No messages yet"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground truncate">
                      {chat.description || "Start or continue this conversation"}
                    </p>
                  </CardContent>
                </Card>
              ))}

              {/* New chat card */}
              <Card 
                className="cursor-pointer hover:bg-muted/50 transition-colors border-dashed"
                onClick={() => {
                  // Focus on creating a new chat
                  document.querySelector("button")?.click();
                }}
              >
                <CardHeader className="pb-2 text-center">
                  <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <MessageSquarePlus size={24} className="text-primary" />
                  </div>
                  <CardTitle className="text-lg">New Chat</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Start a new conversation
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}