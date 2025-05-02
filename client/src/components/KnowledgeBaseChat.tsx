import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { chatWithKnowledgeBase, KnowledgeBaseChatMessage, convertSvgToPng, getDiagramScreenshot, convertMermaidToPng } from '../lib/api';
import { apiRequest } from '@/lib/queryClient';
import { getFullUrl } from '@/lib/config';
import { Loader2, Image as ImageIcon, ZoomIn, ZoomOut, Maximize, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from "@/components/ui/toast";
import { Progress } from "@/components/ui/progress";
import * as htmlToImage from 'html-to-image';
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
        
        // METHOD 1: Direct SVG approach - convert to PNG in browser
        try {
          // Use the SVG API to get the SVG content
          const svgUrl = getFullUrl(`/api/diagram-svg/${baseFileName}.xml`);
          console.log(`Fetching diagram SVG from API for PNG conversion: ${svgUrl}`);
          
          const response = await fetch(svgUrl);
          
          if (response.ok) {
            const svgText = await response.text();
            // Create a temporary hidden SVG container
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = svgText.trim();
            document.body.appendChild(tempDiv);
            const svgElement = tempDiv.querySelector('svg');
            
            if (svgElement) {
              // Get SVG dimensions
              const width = parseFloat(svgElement.getAttribute('width') || '800');
              const height = parseFloat(svgElement.getAttribute('height') || '600');
              
              // Create a canvas with higher resolution
              const canvas = document.createElement('canvas');
              const scale = 2; // Higher resolution scale factor
              canvas.width = width * scale;
              canvas.height = height * scale;
              
              // Convert SVG to string
              const svgString = new XMLSerializer().serializeToString(svgElement);
              const encodedSvg = encodeURIComponent(svgString);
              const svgBlob = new Blob([svgText], {type: 'image/svg+xml'});
              const url = URL.createObjectURL(svgBlob);
              
              // Extract viewBox to get the full diagram dimensions
              let fullWidth = width;
              let fullHeight = height;
              const viewBoxAttr = svgElement.getAttribute('viewBox');
              
              if (viewBoxAttr) {
                const viewBoxValues = viewBoxAttr.split(' ').map(parseFloat);
                if (viewBoxValues.length === 4) {
                  // viewBox format: minX minY width height
                  fullWidth = viewBoxValues[2];
                  fullHeight = viewBoxValues[3];
                }
              }
              
              // Create image and load the SVG
              const img = new Image();
              img.onload = () => {
                // Set canvas size to match the full diagram size (with high resolution)
                canvas.width = fullWidth * scale;
                canvas.height = fullHeight * scale;
                
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  // Set white background
                  ctx.fillStyle = 'white';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  
                  // Reset any previous transform
                  ctx.setTransform(1, 0, 0, 1, 0, 0);
                  
                  // Scale for high resolution
                  ctx.scale(scale, scale);
                  
                  // Draw the complete image, not just the visible part
                  ctx.drawImage(img, 0, 0, fullWidth, fullHeight);
                }
                
                // Convert to PNG and download
                canvas.toBlob((blob) => {
                  if (!blob) {
                    throw new Error('Canvas to Blob conversion failed');
                  }
                  
                  const pngUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = pngUrl;
                  a.download = `rivermeadow_diagram_${Date.now()}.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  
                  // Clean up
                  URL.revokeObjectURL(pngUrl);
                  URL.revokeObjectURL(url);
                  document.body.removeChild(tempDiv);
                  
                  toast({
                    title: "Success", 
                    description: "Diagram downloaded as PNG",
                  });
                  setIsLoading(false);
                }, 'image/png', 1.0);
              };
              
              img.onerror = () => {
                console.error('Failed to load SVG as image');
                document.body.removeChild(tempDiv);
                // Continue to fallback methods
                tryServerPngScreenshot();
              };
              
              img.src = url;
              return; // Exit early, onload will handle completion
            } else {
              document.body.removeChild(tempDiv);
              console.warn('SVG element not found in response');
            }
          }
        } catch (error) {
          console.warn("Error converting SVG to PNG in browser:", error);
        }
        
        // METHOD 2: Try server-side screenshot method
        // Define the function here so it's available for all code paths
        const tryServerPngScreenshot = async () => {
          try {
            // Use the screenshot API to get a PNG version
            const screenshotUrl = getFullUrl(`/api/screenshot-diagram/${baseFileName}`);
            console.log(`Attempting to get PNG screenshot from server: ${screenshotUrl}`);
            
            const response = await fetch(screenshotUrl);
            
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
              return true;
            } else {
              console.warn("PNG screenshot not available from server");
              return false;
            }
          } catch (error) {
            console.warn("Error getting PNG screenshot from server:", error);
            return false;
          }
        };
        
        // METHOD 3: Last resort - download drawio XML
        const downloadXmlAsFallback = async () => {
          try {
            // As a last resort, download the XML file
            const xmlApiPath = getFullUrl(`/api/diagram-xml/${baseFileName}.xml`);
            console.log(`Falling back to diagram XML download: ${xmlApiPath}`);
            
            const xmlResponse = await fetch(xmlApiPath);
            
            if (xmlResponse.ok) {
              // Create a rendered PNG first using the SVG approach
              // Then ask user if they want to download the XML instead
              
              toast({
                title: "PNG Conversion Failed", 
                description: "Would you like to download the diagram source file (drawio) instead?",
                action: (
                  <ToastAction altText="Download XML" onClick={async () => {
                    // Download the XML as a Draw.IO file
                    const blob = await xmlResponse.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `rivermeadow_diagram_${Date.now()}.drawio`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  }}>
                    Download
                  </ToastAction>
                ),
              });
              
              // Just open the diagram in a new tab for now
              window.open(getFullUrl(imagePath), '_blank');
            } else {
              // If all else fails, open in a new tab
              window.open(getFullUrl(imagePath), '_blank');
              
              toast({
                title: "Opening diagram page",
                description: "Please use your browser to save a screenshot",
              });
            }
          } catch (error) {
            console.error("Error with all download methods:", error);
            window.open(getFullUrl(imagePath), '_blank');
            
            toast({
              title: "Diagram opened in new tab",
              description: "Please use your browser to save a screenshot",
            });
          }
        };
        
        // Try server PNG approach, then XML fallback if needed
        const pngSuccess = await tryServerPngScreenshot();
        if (!pngSuccess) {
          await downloadXmlAsFallback();
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
                              <div className="relative">
                                <div className="text-center mb-4 p-2 bg-blue-50 rounded text-sm text-gray-700">
                                  <strong>Draw.IO Diagram</strong> - Click the Download button to edit in diagrams.net
                                </div>
                                
                                {/* Load SVG version directly for better performance */}
                                <div className="diagram-container overflow-x-auto border border-gray-200 rounded h-[450px]">
                                  {/* Always use the SVG endpoint for better performance and reliability */}
                                  <iframe 
                                    src={getFullUrl(`/api/diagram-svg/${ref.imagePath?.split('/').pop()?.replace('.html', '.xml')}`)}
                                    title="RiverMeadow Diagram" 
                                    className="min-w-full min-h-full"
                                    style={{ 
                                      minWidth: '1000px', 
                                      height: '450px',
                                      // Improve text rendering
                                      WebkitFontSmoothing: 'antialiased',
                                      MozOsxFontSmoothing: 'grayscale',
                                      textRendering: 'optimizeLegibility'
                                    }}
                                    loading="lazy"
                                    sandbox="allow-scripts allow-same-origin allow-popups"
                                  />
                                </div>
                              </div>
                              
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
                                    if (iframe?.contentWindow) {
                                      // Send simple message format for better compatibility
                                      iframe.contentWindow.postMessage({
                                        action: 'zoom',
                                        scale: newZoom
                                      }, '*');
                                    }
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
                                    if (iframe?.contentWindow) {
                                      // Send simple message format for better compatibility
                                      iframe.contentWindow.postMessage({
                                        action: 'zoom',
                                        scale: defaultZoom
                                      }, '*');
                                    }
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="Reset zoom"
                                >
                                  <span className="text-xs px-1">
                                    {Math.round((diagramZooms[ref.imagePath!] || 0.7) * 100)}%
                                  </span>
                                </button>
                                
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const currentZoom = diagramZooms[ref.imagePath!] || 0.7;
                                    const newZoom = Math.min(1.5, currentZoom + 0.1);
                                    setDiagramZooms({...diagramZooms, [ref.imagePath!]: newZoom});
                                    
                                    // Send zoom message to iframe
                                    const iframe = e.currentTarget.closest('.relative')?.querySelector('iframe');
                                    if (iframe?.contentWindow) {
                                      // Send simple message format for better compatibility
                                      iframe.contentWindow.postMessage({
                                        action: 'zoom',
                                        scale: newZoom
                                      }, '*');
                                    }
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
                                    window.open(getFullUrl(ref.imagePath || ''), '_blank');
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
                                src={getFullUrl(ref.imagePath || '')} 
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