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
  
  // Function to download diagrams
  const downloadDiagram = async (imagePath: string, index: number) => {
    try {
      setIsLoading(true);
      
      toast({
        title: "Processing",
        description: "Preparing diagram for download...",
      });
      
      // Extract the filename from the path for server request
      const pathParts = imagePath.split('/');
      const fileName = pathParts[pathParts.length - 1];
      
      // Check if it's an HTML diagram for Draw.IO
      if (imagePath.endsWith('.html') || imagePath.includes('diagram-svg')) {
        console.log(`Processing diagram: ${fileName}`);
        
        // Get the base filename without extension
        let baseFileName = fileName;
        if (fileName.endsWith('.html')) {
          baseFileName = fileName.replace('.html', '');
        } else if (fileName.endsWith('.xml')) {
          baseFileName = fileName.replace('.xml', '');
        }
        
        // Provide multiple download options for maximum compatibility
        toast({
          title: "Download Options",
          description: "Choose your preferred download format",
          action: (
            <div className="flex flex-col gap-2 mt-2">
              <ToastAction 
                altText="Download as PNG" 
                onClick={async () => {
                  try {
                    // Download as PNG
                    const pngUrl = getFullUrl(`/api/download-full-diagram/${baseFileName}`);
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
                  } catch (error) {
                    console.error("Error downloading PNG:", error);
                    toast({
                      title: "Error",
                      description: "Failed to download diagram as PNG",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Download as PNG
              </ToastAction>
              
              <ToastAction 
                altText="Download as DrawIO" 
                onClick={async () => {
                  try {
                    // Download as DrawIO XML
                    const xmlUrl = getFullUrl(`/api/diagram-xml-download/${baseFileName}`);
                    const response = await fetch(xmlUrl);
                    
                    if (response.ok) {
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `rivermeadow_diagram_${Date.now()}.drawio`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                      
                      toast({
                        title: "Success",
                        description: "Diagram downloaded as DrawIO XML",
                      });
                    } else {
                      toast({
                        title: "Error",
                        description: "Failed to download diagram as DrawIO XML",
                        variant: "destructive",
                      });
                    }
                  } catch (error) {
                    console.error("Error downloading DrawIO XML:", error);
                    toast({
                      title: "Error",
                      description: "Failed to download diagram as DrawIO XML",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Download as DrawIO XML
              </ToastAction>
              
              <ToastAction 
                altText="View SVG" 
                onClick={() => {
                  // View SVG in a new tab
                  const svgUrl = getFullUrl(`/api/extract-diagram-svg/${baseFileName}`);
                  window.open(svgUrl, '_blank');
                  
                  toast({
                    title: "Success",
                    description: "SVG version opened in new tab",
                  });
                }}
              >
                View SVG Version
              </ToastAction>
            </div>
          ),
          duration: 10000,
        });
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
    
    // First pattern: explicit drawing requests
    const explicitDrawRequest = /(?:create|generate|draw|make|show|give\sme)\s+(?:a|an|the)?\s*(?:diagram|chart|graph|visualization|flow)/i.test(content);
    
    // Second pattern: domain-specific diagram requests
    const domainSpecificRequest = /(?:network|architecture|infrastructure|system|migration|flow)\s+(?:diagram|visualization|chart)/i.test(content);
    
    // Third pattern: RiverMeadow-specific diagram requests that we know will generate diagrams
    const riverMeadowSpecificRequest = /RiverMeadow\s+(?:migration|diagram|workflow|framework|process).*(?:diagram|visual|chart)/i.test(content);
    
    // Fourth pattern: explicit mentions of diagram tools
    const diagramToolRequest = /(?:draw\.io|graphviz|mermaid|visio|lucidchart)/i.test(content);
    
    // Return true only if any of these specific patterns match
    return explicitDrawRequest || domainSpecificRequest || riverMeadowSpecificRequest || diagramToolRequest;
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
      
      // Check if we actually got a diagram in the response
      const hasDiagram = assistantMessage.references?.some(
        ref => ref.type === 'image' && ref.imagePath?.endsWith('.html')
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
                      // Check if it's an HTML diagram (ends with .html)
                      const isHtmlDiagram = ref.imagePath?.endsWith('.html');
                      
                      return (
                        <div key={index} className="rounded-lg overflow-hidden border border-gray-200">
                          {isHtmlDiagram ? (
                            // Render Draw.IO diagram directly in the chat with embedded viewer
                            <div className="relative w-full bg-white p-4">
                              {/* Show the diagram directly as an image */}
                              <p className="text-sm text-muted-foreground mb-2">{ref.caption || 'Generated Diagram'}</p>
                            
                              {/* Diagram container */}
                              <div className="relative border rounded-lg overflow-hidden bg-white">
                                {/* Calculate zoom factor from state or default to 50% */}
                                <div 
                                  className="relative w-full"
                                  style={{ height: '400px' }}
                                >
                                  <iframe 
                                    src={getFullUrl(ref.imagePath!)} 
                                    className="w-full h-full"
                                    style={{
                                      transform: `scale(${diagramZooms[ref.imagePath!] || 0.5})`,
                                      transformOrigin: 'top left',
                                      width: diagramZooms[ref.imagePath!] ? `${100 / diagramZooms[ref.imagePath!]}%` : '200%',
                                      height: diagramZooms[ref.imagePath!] ? `${100 / diagramZooms[ref.imagePath!]}%` : '200%',
                                    }}
                                  />
                                </div>
                                
                                {/* Controls overlay */}
                                <div className="absolute top-2 right-2 bg-white/70 backdrop-blur-sm rounded-md shadow p-1 flex gap-1">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      // Decrease zoom: current * 0.9 or default * 0.9
                                      const currentZoom = diagramZooms[ref.imagePath!] || 0.5;
                                      const newZoom = Math.max(0.1, currentZoom * 0.9);
                                      setDiagramZooms({
                                        ...diagramZooms,
                                        [ref.imagePath!]: newZoom
                                      });
                                      // Store zoom preference
                                      localStorage.setItem(`diagram_zoom_${ref.imagePath}`, newZoom.toString());
                                    }}
                                  >
                                    <ZoomOut className="h-4 w-4" />
                                  </Button>
                                  
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      // Increase zoom: current * 1.1 or default * 1.1
                                      const currentZoom = diagramZooms[ref.imagePath!] || 0.5;
                                      const newZoom = Math.min(2, currentZoom * 1.1);
                                      setDiagramZooms({
                                        ...diagramZooms,
                                        [ref.imagePath!]: newZoom
                                      });
                                      // Store zoom preference
                                      localStorage.setItem(`diagram_zoom_${ref.imagePath}`, newZoom.toString());
                                    }}
                                  >
                                    <ZoomIn className="h-4 w-4" />
                                  </Button>
                                  
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      // Reset to default 50% zoom or full view
                                      const defaultZoom = 0.5;
                                      setDiagramZooms({
                                        ...diagramZooms,
                                        [ref.imagePath!]: defaultZoom
                                      });
                                      // Store zoom preference
                                      localStorage.setItem(`diagram_zoom_${ref.imagePath}`, defaultZoom.toString());
                                    }}
                                  >
                                    <Maximize className="h-4 w-4" />
                                  </Button>
                                  
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => downloadDiagram(ref.imagePath!, index)}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
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