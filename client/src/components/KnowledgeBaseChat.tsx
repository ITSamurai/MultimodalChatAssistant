import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { chatWithKnowledgeBase, KnowledgeBaseChatMessage } from '../lib/api';
import { apiRequest } from '@/lib/queryClient';
import { getFullUrl } from '@/lib/config';
import { Loader2, Image as ImageIcon, ZoomIn, ZoomOut, Maximize, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useChatTitles } from '@/hooks/use-chat-titles';
import { ToastAction } from "@/components/ui/toast";
import { Progress } from "@/components/ui/progress";
import { AppConfig, defaultConfig } from "@/lib/config-types";
import { DiagramViewer } from '@/components/DiagramViewer';

// Add TypeScript interface for mermaid API in Window
declare global {
  interface Window {
    mermaid?: {
      render: (id: string, text: string) => Promise<{ svg: string }>;
    };
  }
}

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

interface KnowledgeBaseChatProps {
  chatId?: number;
}

export function KnowledgeBaseChat({ chatId }: KnowledgeBaseChatProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  // Store zoom levels for each diagram (path -> zoom level)
  const [diagramZooms, setDiagramZooms] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { updateChatTitle: contextUpdateChatTitle, refreshChats } = useChatTitles();
  
  // Function to generate a suitable chat title based on conversation content
  const generateChatTitle = (messages: Message[]): string => {
    // If no messages, return default title
    if (messages.length === 0) return 'New Conversation';
    
    // Find the most recent user message and assistant response pair
    let userMessage = '';
    let assistantMessage = '';
    
    // Start from the most recent messages and look for the latest complete exchange
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && assistantMessage === '') {
        assistantMessage = messages[i].content;
      }
      else if (messages[i].role === 'user' && userMessage === '' && assistantMessage !== '') {
        userMessage = messages[i].content;
        break; // Found a complete exchange
      }
    }
    
    // If no complete exchange, use the first user message
    if (userMessage === '') {
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'user') {
          userMessage = messages[i].content;
          break;
        }
      }
    }
    
    // Generate a title from the user's message (limited to 40 chars)
    let title = userMessage.trim();
    
    // If title is too long, truncate it
    if (title.length > 40) {
      title = title.substring(0, 40).trim() + '...';
    }
    
    return title;
  };
  
  // Function to update the chat title in the database
  const updateChatTitle = async (chatId: number, messages: Message[]) => {
    try {
      // Generate a new title based on the conversation
      const newTitle = generateChatTitle(messages);
      
      // Get the current chat to check its title
      const chatResponse = await apiRequest('GET', `/api/chats/${chatId}`);
      if (chatResponse.ok) {
        const chat = await chatResponse.json();
        
        // Only update if the title is still default or if we have a better title
        if (chat.title === 'New Conversation' || chat.title.length < newTitle.length) {
          console.log(`Updating chat title for chat ${chatId} with title "${newTitle}"`);
          
          // Use the context's updateChatTitle to update both server and local state
          await contextUpdateChatTitle(chatId, newTitle);
          
          // Force a targeted update of just this chat after a short delay
          setTimeout(() => {
            refreshChats();
          }, 500);
        }
      }
    } catch (error) {
      console.error('Error updating chat title:', error);
    }
  };
  
  // Load existing chat messages when chatId changes
  useEffect(() => {
    async function loadChatMessages() {
      if (!chatId) return;
      
      setIsLoading(true);
      try {
        const response = await apiRequest('GET', `/api/chats/${chatId}/messages`);
        
        if (response.ok) {
          const chatMessages = await response.json();
          // Convert chat messages to the format our component uses
          const convertedMessages = chatMessages.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            references: msg.references || undefined
          }));
          
          setMessages(convertedMessages);
        } else {
          console.error('Failed to load chat messages');
        }
      } catch (error) {
        console.error('Error loading chat messages:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadChatMessages();
  }, [chatId]);
  
  // Function to download diagrams - simple version that directly gets PNG
  const downloadDiagram = async (imagePath: string, index: number) => {
    try {
      setIsLoading(true);
      
      toast({
        title: "Processing",
        description: "Preparing diagram for download...",
      });
      
      // Extract the base path without query parameters
      const pathWithoutParams = imagePath.split('?')[0];
      
      // Extract the filename from the clean path for server request
      const pathParts = pathWithoutParams.split('/');
      const fileName = pathParts[pathParts.length - 1];
      
      console.log(`Downloading diagram with path: ${imagePath}`);
      console.log(`Extracted filename: ${fileName}`);
      
      // Check if it's a diagram (now using includes instead of endsWith to handle query params)
      if (imagePath.includes('.html') || imagePath.includes('.drawio') || imagePath.includes('diagram-svg')) {
        console.log(`Processing diagram: ${fileName}`);
        
        // Get the base filename without extension and without query params
        let baseFileName = fileName;
        
        // Remove any query parameters
        baseFileName = baseFileName.split('?')[0];
        
        // Handle various extensions
        if (baseFileName.includes('.html')) {
          baseFileName = baseFileName.replace('.html', '');
        } else if (baseFileName.includes('.xml')) {
          baseFileName = baseFileName.replace('.xml', '');
        } else if (baseFileName.includes('.drawio')) {
          baseFileName = baseFileName.replace('.drawio', '');
        }
        
        // Just download as PNG directly without options
        const pngUrl = getFullUrl(`/api/download-full-diagram/${baseFileName}`);
        console.log(`Downloading diagram from: ${pngUrl}`);
        
        const response = await fetch(pngUrl);
        
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `rivermeadow_diagram_${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          
          toast({
            title: "Success", 
            description: "Diagram downloaded as PNG",
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to download diagram as PNG",
            variant: "destructive",
          });
        }
      } else {
        // For regular images, just create a download link
        const link = document.createElement('a');
        link.href = getFullUrl(imagePath);
        link.download = `rivermeadow_image_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: "Success",
          description: "Image downloaded successfully",
        });
      }
    } catch (error) {
      console.error("Error with diagram:", error);
      toast({
        title: "Failed to download diagram",
        description: "Please try again or take a screenshot of the diagram",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Detect diagram-related commands in user message
  const isDiagramRequest = (content: string): boolean => {
    // More specific diagram request detection with stronger contextual clues
    
    // First pattern: explicit drawing or visualization requests
    const explicitVisualRequest = /(?:create|generate|draw|make|show|give\sme|visualize|illustrate|display)\s+(?:a|an|the)?\s*(?:diagram|chart|graph|visualization|flow|image|picture|illustration|visual|visual explanation)/i.test(content);
    
    // Second pattern: domain-specific diagram requests
    const domainSpecificRequest = /(?:network|architecture|infrastructure|system|migration|flow|hardware|software|process)\s+(?:diagram|visualization|chart|image|picture|visual|illustration)/i.test(content);
    
    // Third pattern: RiverMeadow-specific requests that we know will generate diagrams
    const riverMeadowSpecificRequest = /RiverMeadow\s+(?:migration|diagram|workflow|framework|process).*(?:diagram|visual|chart|image|picture|illustration|overview)/i.test(content);
    
    // Fourth pattern: explicit mentions of diagram tools
    const diagramToolRequest = /(?:draw\.io|graphviz|mermaid|visio|lucidchart)/i.test(content);
    
    // Fifth pattern: requests for visual explanations
    const visualExplanationRequest = /(?:explain|describe|show)\s+(?:visually|with\s+a\s+diagram|with\s+an\s+image|with\s+a\s+picture|with\s+a\s+visual)/i.test(content);
    
    // Return true if any of these specific patterns match
    return explicitVisualRequest || domainSpecificRequest || riverMeadowSpecificRequest || diagramToolRequest || visualExplanationRequest;
  };
  
  // State to track if the current request is likely a diagram request
  const [currentRequestIsDiagram, setCurrentRequestIsDiagram] = useState(false);

  // Simulated progress for diagram generation
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    
    if (isLoading) {
      // Check if the prompt is specifically requesting a diagram
      const lastMessage = messages[messages.length - 1];
      const isExplicitDiagramRequest = lastMessage && 
                                      lastMessage.role === 'user' && 
                                      isDiagramRequest(lastMessage.content);
      
      // Set state for current request type
      setCurrentRequestIsDiagram(isExplicitDiagramRequest);
      
      // Only show diagram progress for explicit diagram requests
      if (isExplicitDiagramRequest) {
        console.log("Detected diagram request:", lastMessage.content);
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
      // When loading is complete, set progress to 100% (but only if we were showing diagram progress)
      if (isImageGenerating) {
        setLoadingProgress(100);
        setTimeout(() => {
          setIsImageGenerating(false);
          setCurrentRequestIsDiagram(false);
        }, 500);
      }
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading, messages, isImageGenerating]);

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
      // Save the user message to the chat in the database if we have a chatId
      if (chatId) {
        try {
          // Save the message to the database
          await apiRequest('POST', `/api/chats/${chatId}/messages`, {
            role: 'user',
            content: input
          });
          
          // If this is the first message in the chat, update the title right away
          if (messages.length === 0) {
            console.log("First message in chat - updating title immediately");
            // Give a slight delay to ensure all DOM events are processed
            setTimeout(async () => {
              await updateChatTitle(chatId, [userMessage]);
            }, 300);
          }
        } catch (error) {
          console.error('Error saving user message to chat:', error);
        }
      }
      
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
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content,
        references: response.references
      };
      
      // Check if we actually got a diagram in the response (using includes to handle query params)
      const hasDiagram = assistantMessage.references?.some(
        ref => ref.type === 'image' && (ref.imagePath?.includes('.html') || ref.imagePath?.includes('.drawio'))
      );
      
      // If we're showing diagram progress but didn't get a diagram, turn it off
      if (currentRequestIsDiagram && !hasDiagram) {
        setIsImageGenerating(false);
      }
      
      setMessages((prev) => [...prev, assistantMessage]);
      
      // Save the assistant message to the chat in the database if we have a chatId
      if (chatId) {
        try {
          await apiRequest('POST', `/api/chats/${chatId}/messages`, {
            role: 'assistant',
            content: response.content,
            references: response.references
          });
          
          // Update chat title based on the conversation after receiving assistant response
          console.log("Updating chat title after receiving AI response");
          // Small delay to ensure message is processed first
          setTimeout(async () => {
            await updateChatTitle(chatId, [...messages, userMessage, assistantMessage]);
          }, 500);
        } catch (error) {
          console.error('Error saving assistant message to chat:', error);
        }
      }
      
      // Additional scroll after message is added and refs are available
      setTimeout(() => {
        scrollToBottom();
        // Try one more time after images and diagrams have loaded
        setTimeout(scrollToBottom, 1000);
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      let errorMessage = "Failed to get a response. Please try again.";
      
      if (error instanceof Error) {
        errorMessage += ` Details: ${error.message}`;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  function renderMessages() {
    if (messages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <p className="text-lg">Ask me anything about the knowledge in the vector database</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        {messages.map((message, i) => (
          <Card 
            key={i}
            className={`${
              message.role === 'user' 
                ? 'ml-auto bg-primary text-primary-foreground' 
                : 'mr-auto bg-muted'
            } max-w-[80%]`}
          >
            <CardContent className="p-3">
              <p className="whitespace-pre-wrap">{message.content}</p>
              
              {message.references && message.references.filter(ref => ref.type === 'image' && ref.imagePath).length > 0 && (
                <div className="mt-3 space-y-3">
                  {message.references
                    .filter(ref => ref.type === 'image' && ref.imagePath)
                    .map((ref, index) => {
                      // Check if it's a diagram (contains .drawio or .html, regardless of query params)
                      const isDiagram = ref.imagePath?.includes('.drawio') || ref.imagePath?.includes('.html');
                      
                      return (
                        <div key={index} className="rounded-lg overflow-hidden border border-gray-200">
                          {isDiagram ? (
                            // Render Draw.IO diagram directly in the chat with embedded viewer
                            <div className="relative w-full bg-white p-4">
                              {/* Show the diagram directly as an image */}
                              <p className="text-sm text-muted-foreground mb-2">{ref.caption || 'Generated Diagram'}</p>
                              
                              {/* Force component re-creation with unique key based on timestamp and random seed */}
                              {/* This ensures each diagram is treated as a brand new component, avoiding caching issues */}
                              <div key={`diagram-${ref.imagePath}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`}>
                                <DiagramViewer 
                                  diagramPath={ref.imagePath!} 
                                  altText={ref.caption || 'RiverMeadow Migration Diagram'} 
                                />
                              </div>
                            </div>
                          ) : (
                            // Regular image
                            <div>
                              <img 
                                src={getFullUrl(ref.imagePath!)} 
                                alt={ref.caption || 'Generated image'} 
                                className="w-full" 
                              />
                              
                              {ref.caption && (
                                <div className="p-2 text-sm text-muted-foreground">
                                  {ref.caption}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 ml-2"
                                    onClick={() => downloadDiagram(ref.imagePath!, index)}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        <div ref={messagesEndRef} className="h-[1px] w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-4 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full">
            {isImageGenerating ? (
              <>
                <p className="mb-3 text-center">
                  {currentRequestIsDiagram 
                    ? "Generating diagram based on request..." 
                    : "Thinking..."}
                </p>
                <Progress value={loadingProgress} className="w-[60%] mb-2" />
                <p className="text-sm text-muted-foreground">
                  {loadingProgress < 30 
                    ? "Analyzing request and retrieving context..." 
                    : loadingProgress < 60
                      ? "Designing diagram structure..." 
                      : loadingProgress < 90
                        ? "Finalizing diagram..." 
                        : "Almost ready..."}
                </p>
              </>
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            )}
          </div>
        ) : (
          renderMessages()
        )}
      </div>
      
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about the knowledge base..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}