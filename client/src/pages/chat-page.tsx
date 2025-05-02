import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { ChatSidebar } from "@/components/ChatSidebar";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { Chat, ChatMessage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

type ChatData = {
  chat: Chat;
  messages: ChatMessage[];
};

export default function ChatPage() {
  const [, params] = useRoute<{ id: string }>("/chat/:id");
  const chatId = params?.id ? parseInt(params.id, 10) : null;
  const { user } = useAuth();
  const { toast } = useToast();
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch chat and messages
  const {
    data: chatData,
    isLoading,
    error,
  } = useQuery<ChatData>({
    queryKey: [`/api/chats/${chatId}`],
    enabled: !!chatId && !!user,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/chats/${chatId}/messages`, {
        content,
        role: "user",
      });
      return res.json();
    },
    onSuccess: () => {
      // Clear input and refresh messages
      setMessageInput("");
      queryClient.invalidateQueries({ queryKey: [`/api/chats/${chatId}`] });
    },
    onError: (error) => {
      toast({
        title: "Error sending message",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  // Scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatData?.messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !chatId) return;
    sendMessageMutation.mutate(messageInput);
  };

  // Format message content with simple markdown-like formatting
  const formatMessage = (content: string) => {
    if (!content) return "";
    
    // Handle code blocks
    content = content.replace(
      /```([\s\S]*?)```/g,
      '<pre class="bg-muted p-2 rounded-md overflow-auto my-2 text-sm">$1</pre>'
    );
    
    // Handle inline code
    content = content.replace(
      /`([^`]+)`/g,
      '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>'
    );
    
    // Handle bullet points
    content = content.replace(
      /^\s*[-*]\s+(.+)$/gm,
      '<li class="ml-4">$1</li>'
    );
    
    // Replace newlines with <br>
    content = content.replace(/\n/g, "<br>");
    
    return content;
  };

  return (
    <div className="flex h-screen">
      <ChatSidebar />
      <div className="flex-1 flex flex-col h-full">
        {/* Chat header */}
        <header className="border-b p-4">
          <h1 className="font-semibold text-lg">
            {isLoading ? (
              <span className="flex items-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading chat...
              </span>
            ) : error ? (
              "Error loading chat"
            ) : (
              chatData?.chat.title || "Chat"
            )}
          </h1>
        </header>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </div>
          ) : error ? (
            <div className="flex justify-center items-center h-full text-destructive">
              Error loading chat messages
            </div>
          ) : chatData?.messages.length === 0 ? (
            <div className="flex justify-center items-center h-full text-muted-foreground">
              No messages yet. Start the conversation!
            </div>
          ) : (
            <>
              {chatData?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-3xl rounded-lg p-3 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <div 
                      className="prose-sm"
                      dangerouslySetInnerHTML={{ 
                        __html: formatMessage(message.content) 
                      }}
                    />
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Message input */}
        <div className="border-t p-4">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Textarea
              placeholder="Type your message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              className="min-h-[60px] resize-none"
              disabled={sendMessageMutation.isPending}
            />
            <Button
              type="submit"
              disabled={
                sendMessageMutation.isPending || !messageInput.trim()
              }
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}