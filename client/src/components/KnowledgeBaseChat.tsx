import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { chatWithKnowledgeBase, KnowledgeBaseChatMessage } from '../lib/api';
import { apiRequest } from '@/lib/queryClient';
import { getFullUrl } from '@/lib/config';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from "@/components/ui/progress";
import { AppConfig, defaultConfig } from "@/lib/config-types";

interface MessageReference {
  type: 'image' | 'text';
  imagePath?: string;
  caption?: string;
  content?: string;
  id?: number;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  references?: MessageReference[];
}

export function KnowledgeBaseChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Simulated progress for image generation
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    
    if (isLoading) {
      // Check if the prompt might be requesting an image
      const lastMessage = messages[messages.length - 1];
      const promptMightRequestImage = lastMessage && lastMessage.role === 'user' && 
        /diagram|draw|visualize|chart|graph|show|create|generate/i.test(lastMessage.content);
      
      if (promptMightRequestImage) {
        setIsImageGenerating(true);
        setLoadingProgress(0);
        
        // Simulate progress increasing over time
        interval = setInterval(() => {
          setLoadingProgress(prev => {
            // Slow down progress as it gets higher to simulate waiting for API
            const increment = prev < 30 ? 5 : prev < 70 ? 3 : 1;
            const newProgress = Math.min(prev + increment, 95);
            return newProgress;
          });
        }, 500);
      }
    } else {
      // When loading is complete, set progress to 100%
      if (isImageGenerating) {
        setLoadingProgress(100);
        setTimeout(() => {
          setIsImageGenerating(false);
        }, 500);
      }
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading, messages]);

  const scrollToBottom = () => {
    // Use both approaches for more reliable scrolling
    // 1. Scroll the messages container
    const chatContainer = document.querySelector('.flex-1.p-4.overflow-auto');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // 2. Scroll the reference into view as fallback
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end' 
      });
    }
  };

  useEffect(() => {
    // Use a small delay to ensure DOM is fully updated before scrolling
    const scrollTimer = setTimeout(() => {
      scrollToBottom();
    }, 100);
    
    return () => clearTimeout(scrollTimer);
  }, [messages]);
  
  // Force scroll on new assistant messages
  useEffect(() => {
    // Only scroll when a new assistant message is added
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      // Use a slightly longer delay for assistant messages to ensure images are loaded
      const timer = setTimeout(() => {
        scrollToBottom();
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    // Add user message
    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Format messages for API
      const apiMessages: KnowledgeBaseChatMessage[] = [
        ...messages,
        userMessage
      ];
      
      console.log('Sending chat request with messages:', JSON.stringify(apiMessages));
      
      // Fetch configuration
      let config: AppConfig = { ...defaultConfig };
      try {
        // Use apiRequest which automatically adds the auth token
        const configResponse = await apiRequest('GET', '/api/config');
        
        if (configResponse.ok) {
          const serverConfig = await configResponse.json();
          config = { ...defaultConfig, ...serverConfig };
          console.log('Using configuration from server:', config);
        }
      } catch (error) {
        console.warn('Could not fetch configuration, using defaults', error);
      }
      
      // Get AI response using configuration
      const response = await chatWithKnowledgeBase(apiMessages, {
        // Use config values if available, otherwise use defaults
        model: config.model || 'gpt-4o',
        temperature: typeof config.temperature === 'number' ? config.temperature : 0.5,
        maxTokens: typeof config.max_tokens === 'number' ? config.max_tokens : 2048
      });
      
      console.log('Received response:', response);
      
      // Check if response has the expected structure
      if (!response || typeof response.content !== 'string') {
        console.error('Invalid response format:', response);
        throw new Error('Invalid response format from server');
      }
      
      // Add AI response to messages with references if available
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: response.content,
        references: response.references
      }]);
      
      // Additional scroll after message is added and refs are available
      setTimeout(scrollToBottom, 300);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Error getting AI response:', error);
      
      // Add an error message
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `I'm sorry, there was an error processing your request: ${error.message}. Please try again.`
      }]);
      
      toast({
        title: "Error",
        description: `Failed to get response: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 p-4 overflow-auto">
        {messages.length === 0 ? (
          <Card className="mb-4">
            <CardContent className="p-6 text-center">
              <h3 className="text-lg font-medium mb-2">Welcome to RiverMeadow AI Chat</h3>
              <p className="text-gray-500 mb-4">
                Ask me anything about RiverMeadow's cloud migration technology and services.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4 text-left text-sm">
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4"
                  onClick={() => {
                    setInput("What are RiverMeadow's main migration services?");
                  }}
                >
                  What are RiverMeadow's main migration services?
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4"
                  onClick={() => {
                    setInput("How does OS-based migration work?");
                  }}
                >
                  How does OS-based migration work?
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4"
                  onClick={() => {
                    setInput("Create a diagram showing the steps for a VM migration");
                  }}
                >
                  Create a diagram showing the steps for a VM migration
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4"
                  onClick={() => {
                    setInput("What cloud platforms does RiverMeadow support?");
                  }}
                >
                  What cloud platforms does RiverMeadow support?
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          // Messages
          messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 ${
                message.role === 'assistant'
                  ? 'bg-gray-50 rounded-lg p-4 shadow-sm'
                  : ''
              }`}
            >
              <div className="flex items-start">
                <div className="mr-2 font-semibold min-w-[70px]">
                  {message.role === 'user' ? 'You:' : 'Assistant:'}
                </div>
                <div className="flex-1">
                  <div className="prose prose-sm max-w-none">
                    {message.content}
                  </div>
                  
                  {/* Display references/images if available */}
                  {message.references && message.references.map((ref, idx) => (
                    <div key={idx} className="mt-3">
                      {ref.type === 'image' && ref.imagePath && (
                        <div className="relative">
                          <img 
                            src={getFullUrl(ref.imagePath)}
                            alt={ref.caption || "Generated Image"} 
                            className="w-full h-auto rounded" 
                            loading="lazy"
                          />
                          {ref.caption && (
                            <div className="p-2 text-sm text-gray-500">
                              {ref.caption}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Image generation progress indicator */}
      {isImageGenerating && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100">
          <div className="flex items-center mb-2">
            <ImageIcon className="h-4 w-4 mr-2 animate-pulse" />
            <span className="text-sm">
              Generating diagram{loadingProgress < 100 ? '...' : ' complete!'}
            </span>
          </div>
          <Progress value={loadingProgress} className="w-full h-2" />
        </div>
      )}
      
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question here..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}