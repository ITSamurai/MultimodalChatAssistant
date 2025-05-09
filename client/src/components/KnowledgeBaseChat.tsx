import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DiagramViewer } from './DiagramViewer';
import { apiRequest } from '@/lib/queryClient';
import { ChatMessage } from '@/lib/api';

interface KnowledgeBaseChatProps {
  chatId?: string;
  onUpdateChatHistory?: (messages: ChatMessage[]) => void;
}

export function KnowledgeBaseChat({ chatId, onUpdateChatHistory }: KnowledgeBaseChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  
  // Load chat messages when the component mounts or chat ID changes
  useEffect(() => {
    if (chatId) {
      const loadMessages = async () => {
        try {
          const response = await apiRequest('GET', `/api/chats/${chatId}/messages`);
          if (response.ok) {
            const loadedMessages = await response.json();
            setMessages(loadedMessages);
            
            // Update parent component with loaded messages
            if (onUpdateChatHistory) {
              onUpdateChatHistory(loadedMessages);
            }
          }
        } catch (error) {
          console.error('Error loading chat messages:', error);
          toast({
            title: 'Error',
            description: 'Failed to load chat history.',
            variant: 'destructive',
          });
        }
      };
      
      loadMessages();
    }
  }, [chatId]);

  // Scroll to the bottom when messages change
  useEffect(() => {
    if (endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !chatId) return;

    try {
      // Add user message to the chat
      const userMessage: ChatMessage = { role: 'user', content: prompt };
      setMessages(prev => [...prev, userMessage]);
      
      // Clear the input
      setPrompt('');
      
      // Show loading state
      setIsLoading(true);
      
      // Make API request to get AI response with full message history for context
      const response = await apiRequest('POST', '/api/chat', { 
        messages: [...messages, userMessage], // Send full message history for context
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 2048,
        chatId: parseInt(chatId, 10) // Convert string chatId to number
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      // Parse AI response
      const aiMessage = await response.json();
      
      // Add AI message to chat
      setMessages(prev => [...prev, aiMessage]);
      
      // Update parent component with new messages if callback provided
      if (onUpdateChatHistory) {
        onUpdateChatHistory([...messages, userMessage, aiMessage]);
      }
    } catch (error) {
      console.error('Error submitting prompt:', error);
      toast({
        title: 'Error',
        description: 'Failed to get response from the AI. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle generating a diagram
  const handleGenerateDiagram = () => {
    setPrompt('Generate a diagram showing the RiverMeadow cloud migration process');
  };

  // Render different message types
  const renderMessage = (message: ChatMessage, index: number) => {
    const isUser = message.role === 'user';
    
    return (
      <div
        key={message.id || index}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
      >
        <div
          className={`max-w-[80%] rounded-lg p-4 ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
          
          {/* Render references (diagrams, images, etc.) */}
          {!isUser && message.references && message.references.length > 0 && (
            <div className="mt-4">
              {message.references.map((reference, refIndex) => (
                <div key={refIndex} className="mt-2">
                  {reference.type === 'image' && (
                    <DiagramViewer 
                      diagramPath={reference.imagePath} 
                      altText={reference.caption}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center p-8">
            <div className="max-w-md">
              <h3 className="text-xl font-semibold mb-2">
                RiverMeadow Knowledge Assistant
              </h3>
              <p className="text-muted-foreground mb-4">
                Ask questions about RiverMeadow, cloud migration processes, or request diagrams.
              </p>
              <div className="flex flex-col gap-2">
                <ExamplePrompt onClick={() => setPrompt("What is RiverMeadow and how does it work?")}>
                  What is RiverMeadow and how does it work?
                </ExamplePrompt>
                <ExamplePrompt onClick={() => setPrompt("What cloud platforms are supported by RiverMeadow?")}>
                  What cloud platforms are supported by RiverMeadow?
                </ExamplePrompt>
                <ExamplePrompt onClick={() => setPrompt("Draw a diagram of the OS-based migration process")}>
                  Draw a diagram of the OS-based migration process
                </ExamplePrompt>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map(renderMessage)}
            <div ref={endOfMessagesRef} />
          </>
        )}
      </div>
      
      <div className="p-4 mt-auto">
        <form onSubmit={handleSubmit} className="flex w-full gap-3 chat-input-container">
          <Textarea
            placeholder="Ask a question or request a diagram..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[60px] flex-1 text-foreground placeholder:text-muted-foreground/70"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={isLoading || !prompt.trim()}
            className="h-12 w-12 chat-button"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

function ExamplePrompt({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted text-sm transition-colors"
    >
      {children}
    </button>
  );
}