import React, { useState, useEffect, useRef } from "react";
import { ZoomIn, ZoomOut, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface DiagramViewerProps {
  diagramPath: string;
  altText?: string;
}

/**
 * DiagramViewer component for displaying SVG diagrams with zoom, pan, and download functionality
 */
export function DiagramViewer({
  diagramPath,
  altText = "Diagram",
}: DiagramViewerProps) {
  // Basic states for the viewer
  const [svgContent, setSvgContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.7); // Default zoom level (70%)
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // State for drag functionality
  const isDragging = useRef(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const startPosition = useRef({ x: 0, y: 0 });
  const startDragPosition = useRef({ x: 0, y: 0 });

  // Load SVG content when diagramPath changes
  useEffect(() => {
    if (!diagramPath) return;

    const loadSvg = async () => {
      try {
        setLoading(true);
        setError(null);

        // Add a cache-busting parameter to ensure we get the latest version
        const cacheBuster = `cache=${Date.now()}`;
        const url = diagramPath.includes('?') 
          ? `${diagramPath}&${cacheBuster}` 
          : `${diagramPath}?${cacheBuster}`;
          
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Failed to load diagram: ${response.status} ${response.statusText}`);
        }
        
        const svgText = await response.text();
        
        if (!svgText || !svgText.includes('<svg')) {
          throw new Error('Invalid SVG content received');
        }
        
        setSvgContent(svgText);
        setLoading(false);
      } catch (err) {
        console.error('Error loading SVG:', err);
        setError(err instanceof Error ? err.message : 'Failed to load diagram');
        setLoading(false);
      }
    };

    loadSvg();
  }, [diagramPath]);

  // Mouse event handlers for drag functionality
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    
    isDragging.current = true;
    startPosition.current = { x: e.clientX, y: e.clientY };
    startDragPosition.current = { ...position };
    
    // Add a class to indicate dragging state
    if (containerRef.current) {
      containerRef.current.classList.add('dragging');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    
    const dx = e.clientX - startPosition.current.x;
    const dy = e.clientY - startPosition.current.y;
    
    setPosition({
      x: startDragPosition.current.x + dx,
      y: startDragPosition.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    
    // Remove dragging class
    if (containerRef.current) {
      containerRef.current.classList.remove('dragging');
    }
  };

  // Handle zoom in/out with boundaries
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 2.0));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.2));
  };

  // Reset zoom and position
  const handleReset = () => {
    setZoom(0.7);
    setPosition({ x: 0, y: 0 });
  };

  // Download as PNG
  const handleDownload = async () => {
    try {
      // Extract the filename from the path
      const pathParts = diagramPath.split('/');
      const fileName = pathParts[pathParts.length - 1].split('?')[0];
      
      // Download the original diagram file
      const downloadUrl = `/api/download-full-diagram/${fileName}`;
      
      // Create a temporary link and trigger the download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `rivermeadow_diagram_${Date.now()}.drawio`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: "Your diagram is being downloaded.",
      });
    } catch (err) {
      console.error('Error downloading diagram:', err);
      toast({
        title: "Download Failed",
        description: "Failed to download the diagram. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
      {/* Controls bar */}
      <div className="flex items-center justify-between p-2 border-b border-border bg-muted/30">
        <div className="text-sm font-medium">Diagram Viewer</div>
        <div className="flex items-center space-x-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="text-xs px-2">
            {Math.round(zoom * 100)}%
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleReset}
            title="Reset View"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownload}
            title="Download Diagram"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* SVG container with drag functionality */}
      <div
        ref={containerRef}
        className="relative h-[500px] overflow-hidden bg-[#fafafa] cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-t-2 border-primary rounded-full"></div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive p-4">
            <div className="text-lg font-semibold mb-2">Error Loading Diagram</div>
            <div className="text-sm text-center">{error}</div>
          </div>
        )}

        {!loading && !error && svgContent && (
          <div
            className="absolute left-1/2 top-1/2 origin-center transition-transform duration-100"
            style={{
              transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>

      {/* Optional caption */}
      <div className="p-2 text-sm text-muted-foreground border-t border-border">
        {altText}
      </div>
    </div>
  );
}