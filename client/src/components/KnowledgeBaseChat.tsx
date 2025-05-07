import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DiagramViewer } from './DiagramViewer';
import { apiRequest } from '@/lib/queryClient';

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

  // Scroll to the bottom when messages change
  useEffect(() => {
    if (endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    try {
      // Add user message to the chat
      const userMessage: ChatMessage = { role: 'user', content: prompt };
      setMessages(prev => [...prev, userMessage]);
      
      // Clear the input
      setPrompt('');
      
      // Show loading state
      setIsLoading(true);
      
      // Make API request to get AI response
      const response = await apiRequest('POST', '/api/chat', { 
        messages: [
          { role: 'user', content: prompt }
        ],
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 2048,
        chatId
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
    <Card className="flex flex-col h-[700px] border-0 shadow-none">
      <CardContent className="flex-1 overflow-y-auto p-4">
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
      </CardContent>
      
      <CardFooter className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex w-full gap-2">
          <Textarea
            placeholder="Ask a question or request a diagram..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[60px] flex-1"
          />
          <div className="flex flex-col gap-2">
            <Button 
              type="submit" 
              size="icon" 
              disabled={isLoading || !prompt.trim()}
              className="h-12 w-12"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={handleGenerateDiagram}
              className="h-12 w-12"
              title="Generate a diagram"
            >
              <ImagePlus className="h-5 w-5" />
            </Button>
          </div>
        </form>
      </CardFooter>
    </Card>
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