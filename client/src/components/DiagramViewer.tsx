import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, ZoomIn, ZoomOut, Download, RefreshCw, Move } from 'lucide-react';

interface DiagramViewerProps {
  diagramPath: string;
  altText?: string;
  width?: number;
  height?: number;
}

export function DiagramViewer({
  diagramPath,
  altText = 'Diagram',
  width = 800,
  height = 600
}: DiagramViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(50); // Default zoom level (50%)
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Load saved zoom level from localStorage
  useEffect(() => {
    const savedZoom = localStorage.getItem('diagramZoomLevel');
    if (savedZoom) {
      setZoom(parseInt(savedZoom, 10));
    }
  }, []);
  
  // Save zoom level to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('diagramZoomLevel', zoom.toString());
  }, [zoom]);

  // Reset position when diagram changes
  useEffect(() => {
    setPosition({ x: 0, y: 0 });
    setIsLoading(true);
    setError(null);
  }, [diagramPath]);

  // Handle image load/error
  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
    setError('Failed to load diagram');
  };

  // Zoom controls
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 10, 200)); // Max zoom 200%
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 10, 10)); // Min zoom 10%
  };

  const handleReset = () => {
    setZoom(50); // Reset to default
    setPosition({ x: 0, y: 0 }); // Reset position
  };

  // Download diagram
  const handleDownload = async () => {
    try {
      // Extract file name from path
      const fileName = diagramPath.split('/').pop() || 'diagram';
      
      // Determine if this is an SVG or PNG path
      const fileExtension = diagramPath.toLowerCase().endsWith('.svg') ? 'svg' : 'png';
      const downloadName = `${fileName.split('.')[0]}.${fileExtension}`;
      
      // Fetch the image
      const response = await fetch(diagramPath);
      const blob = await response.blob();
      
      // Create download link
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading diagram:', error);
    }
  };

  // Pan/drag functionality
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <Card className="overflow-hidden relative w-full max-w-full">
      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 bg-background/80 backdrop-blur p-1 rounded-md shadow-sm">
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomIn}
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomOut}
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleReset}
          title="Reset View"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleDownload}
          title="Download Diagram"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Pan indicator */}
      <div className="absolute top-2 left-2 z-10 bg-background/80 backdrop-blur p-1 rounded-md shadow-sm flex items-center gap-1 text-xs">
        <Move className="h-3 w-3" />
        <span>Click and drag to pan</span>
      </div>

      {/* Zoom level indicator */}
      <div className="absolute bottom-2 left-2 z-10 bg-background/80 backdrop-blur p-1 rounded-md shadow-sm text-xs">
        {zoom}%
      </div>

      {/* Diagram container */}
      <div 
        ref={containerRef}
        className="overflow-hidden relative h-[400px] w-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-destructive">
            <p>{error}</p>
          </div>
        )}

        <div
          className="absolute transform transition-transform duration-0"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom / 100})`,
            transformOrigin: 'center',
          }}
        >
          <img
            src={diagramPath}
            alt={altText}
            className="max-w-none"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ width: width, height: height }}
          />
        </div>
      </div>
    </Card>
  );
}