import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { chatWithKnowledgeBase, KnowledgeBaseChatMessage, convertSvgToPng, getDiagramScreenshot, convertMermaidToPng } from '../lib/api';
import { Loader2, Image as ImageIcon, ZoomIn, ZoomOut, Maximize, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from "@/components/ui/progress";
import * as htmlToImage from 'html-to-image';

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

export function KnowledgeBaseChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  // Store zoom levels for each diagram (path -> zoom level)
  const [diagramZooms, setDiagramZooms] = useState<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Function to download diagrams or convert them to PNG
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
      const currentOrigin = window.location.origin;
      
      // Check if it's an HTML diagram
      if (imagePath.endsWith('.html')) {
        console.log(`Processing HTML diagram: ${fileName}`);
        
        // Try to use the server-side mmdc conversion first
        // Extract the base filename (without .html) and create an .mmd filename
        const baseFileName = fileName.replace('.html', '');
        const mmdFileName = `${baseFileName}.mmd`;
        
        try {
          console.log(`Converting mermaid diagram to PNG using mmdc: ${mmdFileName}`);
          
          // This will trigger the server-side mmdc conversion with fallback
          const conversionUrl = `${currentOrigin}/api/convert-mermaid-to-png/${mmdFileName}`;
          
          // Since our server route now handles redirects and graceful fallbacks,
          // we'll open this in a new window/tab to let the server handle the appropriate response
          window.open(conversionUrl, '_blank');
          
          toast({
            title: "Diagram Ready",
            description: "The server is processing your diagram. If PNG conversion succeeds, it will download automatically. Otherwise, you'll see the HTML version with save options.",
          });
        } catch (conversionError) {
          console.error("Error accessing conversion endpoint:", conversionError);
          // Fall back to just opening the HTML version directly
          window.open(imagePath, '_blank');
          
          toast({
            title: "Diagram available in new tab",
            description: "Please use the save options in the new tab to save the diagram.",
            variant: "default"
          });
        }
      } else {
        // For regular images, just create a download link
        const link = document.createElement('a');
        link.href = imagePath;
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
        title: "Failed to open diagram",
        description: "Please try again. If the issue persists, you can always take a screenshot of the diagram in the chat",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Simulated progress for DALL-E image generation
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
      
      // Get AI response
      const response = await chatWithKnowledgeBase(apiMessages, {
        temperature: 0.5,
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
                            // Render iframe for HTML-based Mermaid diagram
                            <div className="relative w-full">
                              <iframe 
                                ref={(iframe) => {
                                  if (iframe) {
                                    // When iframe loads, try to resize the diagram
                                    iframe.onload = () => {
                                      try {
                                        iframe.contentWindow?.postMessage('resize', '*');
                                      } catch (e) {
                                        console.error('Failed to send resize message to iframe', e);
                                      }
                                    };
                                  }
                                }}
                                src={ref.imagePath}
                                title="RiverMeadow Diagram" 
                                className="w-full border-none"
                                loading="lazy"
                                sandbox="allow-scripts allow-same-origin"
                                style={{ 
                                  height: "380px",
                                  overflow: "hidden" 
                                }}
                              />
                              
                              {/* Diagram controls */}
                              <div className="absolute bottom-2 right-2 bg-white rounded shadow-md flex items-center">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const currentZoom = diagramZooms[ref.imagePath!] || 0.7;
                                    const newZoom = Math.max(0.4, currentZoom - 0.1);
                                    setDiagramZooms({...diagramZooms, [ref.imagePath!]: newZoom});
                                    
                                    // Send zoom message to iframe
                                    const iframe = e.currentTarget.closest('.relative')?.querySelector('iframe');
                                    iframe?.contentWindow?.postMessage({
                                      action: 'zoom',
                                      scale: newZoom
                                    }, '*');
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="Zoom out"
                                >
                                  <ZoomOut size={16} />
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const defaultZoom = 0.7; // Initial scale value (70%)
                                    setDiagramZooms({...diagramZooms, [ref.imagePath!]: defaultZoom});
                                    
                                    // Send zoom message to iframe
                                    const iframe = e.currentTarget.closest('.relative')?.querySelector('iframe');
                                    iframe?.contentWindow?.postMessage({
                                      action: 'zoom',
                                      scale: defaultZoom
                                    }, '*');
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="Reset zoom"
                                >
                                  <span className="text-xs px-1">70%</span>
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const currentZoom = diagramZooms[ref.imagePath!] || 0.7;
                                    const newZoom = Math.min(1.5, currentZoom + 0.1);
                                    setDiagramZooms({...diagramZooms, [ref.imagePath!]: newZoom});
                                    
                                    // Send zoom message to iframe
                                    const iframe = e.currentTarget.closest('.relative')?.querySelector('iframe');
                                    iframe?.contentWindow?.postMessage({
                                      action: 'zoom',
                                      scale: newZoom
                                    }, '*');
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="Zoom in"
                                >
                                  <ZoomIn size={16} />
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    
                                    // Open diagram in new tab for full view
                                    window.open(ref.imagePath, '_blank');
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="View full screen"
                                >
                                  <Maximize size={16} />
                                </button>
                                
                                <button
                                  onClick={() => downloadDiagram(ref.imagePath!, index)}
                                  className="p-1 hover:bg-gray-100 text-gray-700 ml-1 border-l border-gray-200"
                                  title="Download diagram"
                                >
                                  <Download size={16} />
                                </button>
                              </div>
                              
                              {/* Caption if available */}
                              {ref.caption && (
                                <div className="p-2 text-sm text-gray-500">
                                  {ref.caption}
                                </div>
                              )}
                            </div>
                          ) : (
                            // Regular image
                            <div className="relative">
                              <img 
                                src={ref.imagePath} 
                                alt={ref.caption || "Generated Image"} 
                                className="w-full h-auto" 
                                loading="lazy"
                              />
                              <div className="absolute bottom-2 right-2 bg-white rounded shadow-md">
                                <button
                                  onClick={() => downloadDiagram(ref.imagePath!, index)}
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="Download image"
                                >
                                  <Download size={16} />
                                </button>
                              </div>
                              {ref.caption && (
                                <div className="p-2 text-sm text-gray-500">
                                  {ref.caption}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  }
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        <div ref={messagesEndRef} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b p-4">
        <h2 className="text-lg font-medium">RiverMeadow Knowledge Base Chat</h2>
        <p className="text-sm text-gray-500">Ask questions about RiverMeadow documentation</p>
      </div>
      
      <div className="flex-1 p-4 overflow-auto">
        {renderMessages()}
      </div>
      
      {isImageGenerating && (
        <div className="p-4 pt-0">
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