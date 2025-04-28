import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { chatWithKnowledgeBase, KnowledgeBaseChatMessage } from '../lib/api';
import { Loader2, Image as ImageIcon, ZoomIn, ZoomOut, Maximize, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from "@/components/ui/progress";

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
  
  // Function to download diagrams
  const downloadDiagram = async (imagePath: string, index: number) => {
    try {
      // Check if it's an HTML diagram
      if (imagePath.endsWith('.html')) {
        // For HTML diagrams (Mermaid), we need to fetch the content and extract SVG
        const response = await fetch(imagePath);
        const html = await response.text();
        
        // Create a temporary iframe to load HTML and extract SVG
        const tempFrame = document.createElement('iframe');
        tempFrame.style.position = 'absolute';
        tempFrame.style.opacity = '0';
        tempFrame.style.pointerEvents = 'none';
        tempFrame.style.width = '1000px';
        tempFrame.style.height = '800px';
        document.body.appendChild(tempFrame);
        
        // Set HTML content in iframe
        if (tempFrame.contentDocument) {
          tempFrame.contentDocument.open();
          tempFrame.contentDocument.write(html);
          tempFrame.contentDocument.close();
          
          // Add event listener for when iframe is loaded and ready
          tempFrame.onload = () => {
            setTimeout(() => {
              try {
                if (tempFrame.contentDocument) {
                  // Find the SVG element in the iframe
                  const svgElement = tempFrame.contentDocument.querySelector('.mermaid svg');
                  
                  if (svgElement) {
                    // Clone the SVG to avoid modifications affecting the display
                    const svgClone = svgElement.cloneNode(true) as SVGElement;
                    
                    // Add required attributes for download
                    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                    
                    // Get SVG dimensions
                    const svgRect = svgElement.getBoundingClientRect();
                    const width = svgRect.width || 800;
                    const height = svgRect.height || 600;
                    
                    // Set explicit width and height
                    svgClone.setAttribute('width', `${width}`);
                    svgClone.setAttribute('height', `${height}`);
                    
                    // Add white background
                    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    background.setAttribute('width', '100%');
                    background.setAttribute('height', '100%');
                    background.setAttribute('fill', 'white');
                    svgClone.insertBefore(background, svgClone.firstChild);
                    
                    // Convert SVG to string
                    const svgString = new XMLSerializer().serializeToString(svgClone);
                    
                    // Create a blob with the SVG content
                    const blob = new Blob([svgString], { type: 'image/svg+xml' });
                    
                    // Create a download link
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `rivermeadow_diagram_${Date.now()}.svg`;
                    document.body.appendChild(link);
                    link.click();
                    
                    // Clean up
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    
                    toast({
                      title: "Success",
                      description: "Diagram downloaded as SVG successfully",
                    });
                  } else {
                    // If SVG not found, try to get the code and download as text
                    const preElement = tempFrame.contentDocument.querySelector('.code-fallback');
                    if (preElement) {
                      const mermaidCode = preElement.textContent || '';
                      const blob = new Blob([mermaidCode], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `rivermeadow_diagram_${Date.now()}.mmd`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                      
                      toast({
                        title: "Success",
                        description: "Diagram code downloaded successfully",
                      });
                    } else {
                      throw new Error("SVG element not found in the diagram");
                    }
                  }
                }
              } catch (error) {
                console.error("Error downloading diagram:", error);
                toast({
                  title: "Download failed",
                  description: "Could not extract the diagram for download",
                  variant: "destructive",
                });
              } finally {
                // Remove the temporary iframe
                document.body.removeChild(tempFrame);
              }
            }, 1000); // Wait for the diagram to fully render
          };
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
        description: "Could not download the diagram",
        variant: "destructive",
      });
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
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
                                    const newZoom = Math.min(1.2, currentZoom + 0.1);
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
                                
                                <div className="mx-1 h-4 w-px bg-gray-200"></div>
                                
                                <a 
                                  href={ref.imagePath} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="p-1 hover:bg-gray-100 text-gray-700"
                                  title="Open in full view"
                                >
                                  <Maximize size={16} />
                                </a>
                                
                                <div className="mx-1 h-4 w-px bg-gray-200"></div>
                                
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    // Handle diagram download
                                    if (ref.imagePath) {
                                      // Create a download function that works with HTML diagrams
                                      downloadDiagram(ref.imagePath, index);
                                    }
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700 flex items-center space-x-1"
                                  title="Download diagram"
                                >
                                  <Download size={16} />
                                  <span className="text-xs hidden sm:inline">Download</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            // Render standard image with download button
                            <div className="relative">
                              <img 
                                src={ref.imagePath} 
                                alt={ref.content || 'Generated diagram'} 
                                className="w-full object-cover max-h-[300px] object-center" 
                              />
                              <div className="absolute bottom-2 right-2 bg-white rounded shadow-md">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (ref.imagePath) {
                                      downloadDiagram(ref.imagePath, index);
                                    }
                                  }}
                                  className="p-1 hover:bg-gray-100 text-gray-700 flex items-center space-x-1"
                                  title="Download image"
                                >
                                  <Download size={16} />
                                  <span className="text-xs">Download</span>
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="bg-gray-50 p-2 text-xs text-gray-600">
                            {ref.caption || 'Generated diagram based on your request'}
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        
        {isImageGenerating && (
          <div className="mx-auto max-w-md w-full bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex items-center space-x-2 mb-2">
              <ImageIcon className="h-5 w-5 text-primary animate-pulse" />
              <p className="text-sm font-medium">Generating diagram...</p>
            </div>
            <Progress value={loadingProgress} className="h-2 mb-1" />
            <p className="text-xs text-gray-500 text-right">{loadingProgress}%</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        {renderMessages()}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </Button>
        </form>
      </div>
    </div>
  );
}