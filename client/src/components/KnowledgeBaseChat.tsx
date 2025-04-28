import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { chatWithKnowledgeBase, KnowledgeBaseChatMessage, convertSvgToPng, getDiagramScreenshot } from '../lib/api';
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
  
  // Function to download diagrams using html-to-image direct screenshot approach
  const downloadDiagram = async (imagePath: string, index: number) => {
    try {
      setIsLoading(true);
      
      toast({
        title: "Processing",
        description: "Preparing your download...",
      });
      
      // Check if it's an HTML diagram
      if (imagePath.endsWith('.html')) {
        // Get the iframe containing the diagram
        const iframes = document.querySelectorAll('iframe');
        let targetIframe: HTMLIFrameElement | null = null;
        
        // Find the iframe with the matching src
        for (let i = 0; i < iframes.length; i++) {
          if (iframes[i].src.includes(imagePath)) {
            targetIframe = iframes[i] as HTMLIFrameElement;
            break;
          }
        }
        
        if (!targetIframe) {
          throw new Error("Could not find the diagram iframe");
        }
        
        try {
          // Find the container of the iframe
          const iframeContainer = targetIframe.parentElement;
          if (!iframeContainer) {
            throw new Error("Could not find diagram container");
          }
          
          // Hide diagram controls to get clean screenshot
          const controls = iframeContainer.querySelector('.absolute.bottom-2.right-2');
          if (controls instanceof HTMLElement) {
            controls.style.display = 'none';
          }
          
          try {
            // Adjust iframe styling for good capture
            const originalStyle = targetIframe.style.cssText;
            targetIframe.style.border = 'none';
            targetIframe.style.backgroundColor = 'white';
            
            // Before taking screenshot, ensure the iframe is large enough
            const originalHeight = targetIframe.style.height;
            const originalWidth = targetIframe.style.width;
            
            // Set a larger size to ensure the entire diagram is visible
            // Make the iframe extremely large to ensure we capture the entire diagram
            targetIframe.style.width = '3200px';
            targetIframe.style.height = '3200px';
            
            // Also adjust the parent container
            iframeContainer.style.width = '3000px';
            iframeContainer.style.height = '3000px';
            iframeContainer.style.overflow = 'hidden';
            
            // Give time for resize to apply
            await new Promise(r => setTimeout(r, 500));
            
            // Try to render or reinitialize mermaid diagrams if needed
            try {
              // Post a message to the iframe to force redraw
              targetIframe.contentWindow?.postMessage({ action: 'forceRedraw' }, '*');
            } catch (e) {
              console.warn('Could not send redraw message', e);
            }
            
            // Wait longer for the diagram to fully render in the new size
            await new Promise(r => setTimeout(r, 1000));
            
            // Take screenshot of the diagram container with full dimensions
            const dataUrl = await htmlToImage.toPng(iframeContainer, {
              skipAutoScale: false, // Allow auto-scaling
              pixelRatio: 2,        // Higher quality
              backgroundColor: 'white',
              fontEmbedCSS: '',
              quality: 1.0,
              width: 3200,          // Extremely large width to fit the whole diagram
              height: 3000          // Extremely large height to fit the whole diagram
            });
            
            // Restore iframe and container styles
            targetIframe.style.cssText = originalStyle;
            
            // Reset the container style
            iframeContainer.style.width = '';
            iframeContainer.style.height = '';
            iframeContainer.style.overflow = '';
            
            // Generate filename
            const timestamp = Date.now();
            const filename = `rivermeadow_diagram_${timestamp}.png`;
            
            // Create and trigger download
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            toast({
              title: "Success",
              description: "Diagram downloaded as PNG successfully",
            });
          } finally {
            // Restore diagram controls
            if (controls instanceof HTMLElement) {
              controls.style.display = '';
            }
          }
        } catch (error) {
          console.error("Error taking screenshot:", error);
          
          // Fallback to server-side screenshot
          toast({
            title: "Using alternative method",
            description: "Direct screenshot failed, trying server-side capture...",
          });
          
          // Extract the filename from the path for server request
          const pathParts = imagePath.split('/');
          const fileName = pathParts[pathParts.length - 1];
          
          try {
            // Request screenshot from server
            const response = await getDiagramScreenshot(fileName);
            if (!response.ok) {
              throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            // Convert response to blob
            const imageBlob = await response.blob();
            const url = URL.createObjectURL(imageBlob);
            
            // Trigger download
            const link = document.createElement('a');
            link.href = url;
            link.download = `rivermeadow_diagram_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            toast({
              title: "Success",
              description: "Diagram downloaded from server successfully",
            });
          } catch (serverError) {
            console.error("Server-side screenshot failed:", serverError);
            throw new Error("Both client and server-side screenshot methods failed");
          }
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
      console.error("Error downloading diagram:", error);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download the diagram",
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
                                  title="Open in new tab"
                                >
                                  <Maximize size={16} />
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    
                                    // Download the diagram
                                    downloadDiagram(ref.imagePath!, index);
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="Download as PNG"
                                >
                                  <Download size={16} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            // Render regular image
                            <div className="relative">
                              <img 
                                src={ref.imagePath} 
                                alt={ref.caption || 'AI generated image'} 
                                className="w-full h-auto max-h-[500px] object-contain"
                              />
                              {/* Image controls */}
                              <div className="absolute bottom-2 right-2 bg-white rounded shadow-md flex">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    window.open(ref.imagePath, '_blank');
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="Open in new tab"
                                >
                                  <Maximize size={16} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    downloadDiagram(ref.imagePath!, index);
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="Download"
                                >
                                  <Download size={16} />
                                </button>
                              </div>
                            </div>
                          )}
                          {ref.caption && (
                            <div className="p-2 bg-gray-50 text-sm text-gray-700 border-t">
                              <span className="font-medium">Caption:</span> {ref.caption}
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
        <div ref={messagesEndRef} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex justify-center items-center p-4 border-b">
        <h1 className="text-2xl font-bold">RiverMeadow AI Chat</h1>
      </div>
      
      <div className="flex-1 p-4 overflow-auto pb-20 md:pb-32">
        {renderMessages()}
      </div>
      
      <div className="p-4 border-t fixed bottom-0 left-0 right-0 z-10 bg-background">
        {isImageGenerating && (
          <div className="mb-2 mx-auto max-w-screen-lg">
            <div className="flex justify-between mb-1 text-xs">
              <span>Generating diagram...</span>
              <span>{loadingProgress}%</span>
            </div>
            <Progress value={loadingProgress} className="h-1" />
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="flex space-x-2 mx-auto max-w-screen-lg">
          <Input
            placeholder="Ask about RiverMeadow documentation..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1"
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            className="w-24"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Send'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}