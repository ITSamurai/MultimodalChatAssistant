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
  
  // Function to download diagrams using direct Mermaid API call
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
        
        // Wait for iframe to be fully loaded if needed
        await new Promise<void>((resolve) => {
          if (targetIframe!.contentDocument?.readyState === 'complete') {
            resolve();
          } else {
            targetIframe!.onload = () => resolve();
          }
        });
        
        // Access the iframe document
        const iframeWindow = targetIframe.contentWindow;
        const iframeDocument = targetIframe.contentDocument;
        
        if (!iframeWindow || !iframeDocument) {
          throw new Error("Cannot access iframe content");
        }
        
        // Find the diagram content
        const mermaidDiv = iframeDocument.querySelector('.mermaid');
        if (!mermaidDiv) {
          throw new Error("Could not find diagram in the iframe");
        }
        
        // Get the diagram definition (the original Mermaid code)
        const mermaidCode = mermaidDiv.getAttribute('data-processed') === 'true' 
          ? mermaidDiv.getAttribute('data-diagram') 
          : mermaidDiv.textContent;
          
        if (!mermaidCode) {
          throw new Error("Could not extract Mermaid diagram code");
        }
        
        // Generate a timestamp for the filename
        const timestamp = Date.now();
        const filename = `rivermeadow_diagram_${timestamp}.png`;

        // Create script to add Mermaid's API direct PNG export
        const script = iframeDocument.createElement('script');
        script.textContent = `
          // Function to download the diagram using mermaid.render
          async function downloadAsPng() {
            try {
              if (!window.mermaid) {
                throw new Error("Mermaid not found in window");
              }

              // Get the definition of the current diagram
              const mermaidDef = \`${mermaidCode.replace(/`/g, '\\`')}\`;
              
              // Clean up any existing content and create a container
              const container = document.createElement('div');
              container.id = 'mermaid-png-container';
              container.style.position = 'absolute';
              container.style.left = '-9999px';
              document.body.appendChild(container);
              
              try {
                // Use mermaid to render the diagram
                const { svg } = await window.mermaid.render('mermaid-png-export', mermaidDef);
                
                // Insert the SVG into the container
                container.innerHTML = svg;
                
                // Get the SVG element
                const svgElement = container.querySelector('svg');
                if (!svgElement) {
                  throw new Error('SVG rendering failed');
                }
                
                // Set explicit dimensions on the SVG
                svgElement.setAttribute('width', '1200');
                svgElement.setAttribute('height', '800');
                
                // Convert SVG to canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Create an image with white background
                canvas.width = 1200;
                canvas.height = 800;
                
                // Draw white background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Create an image from the SVG
                const img = new Image();
                const svgText = new XMLSerializer().serializeToString(svgElement);
                const svgBlob = new Blob([svgText], {type: 'image/svg+xml'});
                const url = URL.createObjectURL(svgBlob);
                
                // Wait for image to load before drawing to canvas
                await new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = reject;
                  img.src = url;
                });
                
                // Draw the image on the canvas
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                
                // Convert canvas to PNG
                const pngUrl = canvas.toDataURL('image/png');
                
                // Clean up
                document.body.removeChild(container);
                
                // Return the PNG data URL
                return pngUrl;
              } catch (error) {
                // Clean up on error
                if (document.body.contains(container)) {
                  document.body.removeChild(container);
                }
                throw error;
              }
            } catch (error) {
              console.error('Error generating PNG:', error);
              return null;
            }
          }
          
          // Execute the download
          downloadAsPng().then(dataUrl => {
            if (dataUrl) {
              window.parent.postMessage({
                action: 'mermaidPngExport',
                dataUrl: dataUrl,
                success: true
              }, '*');
            } else {
              window.parent.postMessage({
                action: 'mermaidPngExport',
                success: false,
                error: 'Failed to generate PNG'
              }, '*');
            }
          });
        `;
        
        // Set up a listener for the PNG data URL
        const messageHandler = (event: MessageEvent) => {
          if (event.data && event.data.action === 'mermaidPngExport') {
            window.removeEventListener('message', messageHandler);
            
            if (event.data.success && event.data.dataUrl) {
              // Create a download link
              const link = document.createElement('a');
              link.href = event.data.dataUrl;
              link.download = filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
              toast({
                title: "Success",
                description: "Diagram downloaded as PNG successfully",
              });
            } else {
              toast({
                title: "Error",
                description: event.data.error || "Failed to generate PNG from diagram",
                variant: "destructive",
              });
            }
            
            setIsLoading(false);
          }
        };
        
        // Add the message listener
        window.addEventListener('message', messageHandler);
        
        // Add the script to the iframe to execute the PNG export
        iframeDocument.head.appendChild(script);
        
        // Set a timeout in case the export doesn't complete
        setTimeout(() => {
          window.removeEventListener('message', messageHandler);
          setIsLoading(false);
          toast({
            title: "Error",
            description: "Diagram export timed out. Please try again.",
            variant: "destructive",
          });
        }, 10000);
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
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error downloading diagram:", error);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download the diagram",
        variant: "destructive",
      });
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