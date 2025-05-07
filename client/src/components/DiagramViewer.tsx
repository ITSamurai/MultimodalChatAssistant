import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface DiagramViewerProps {
  diagramPath: string;
  altText?: string;
  onRefresh?: () => void;
}

export function DiagramViewer({ diagramPath, altText = 'Generated Diagram', onRefresh }: DiagramViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [imageUrl, setImageUrl] = useState(diagramPath);

  // Load the diagram
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setImageUrl(diagramPath);
    
    // Simulate loading the diagram
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [diagramPath]);
  
  // Zoom in by 10%
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 10, 200));
  };
  
  // Zoom out by 10%
  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 10, 30));
  };
  
  // Reset zoom to 100%
  const handleResetZoom = () => {
    setZoomLevel(100);
  };
  
  // Handle download
  const handleDownload = () => {
    // Extract file extension from the path
    const isDrawio = imageUrl.includes('.drawio');
    const isSvg = imageUrl.includes('.svg');
    const isPng = imageUrl.includes('.png');
    
    // Determine file extension based on url
    let fileExtension = 'png'; // Default to PNG
    if (isDrawio) fileExtension = 'drawio';
    else if (isSvg) fileExtension = 'svg';
    
    // Create download link
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `diagram.${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  return (
    <Card className="overflow-hidden flex flex-col p-0">
      <div className="flex justify-between items-center px-4 py-2 bg-muted/50">
        <div className="text-sm font-medium">{altText}</div>
        <div className="flex space-x-1">
          <Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={zoomLevel <= 30}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleResetZoom}>
            {zoomLevel}%
          </Button>
          <Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={zoomLevel >= 200}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          {onRefresh && (
            <Button variant="ghost" size="icon" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="relative overflow-auto bg-background p-4 border-t flex justify-center">
        {isLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : error ? (
          <div className="text-center p-8 text-destructive">
            <p>Error loading diagram: {error}</p>
          </div>
        ) : (
          <div className="overflow-auto inline-block min-w-fit">
            <img 
              src={imageUrl} 
              alt={altText}
              style={{ 
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'center center',
                transition: 'transform 0.2s ease-in-out'
              }}
              onError={() => setError('Failed to load diagram')}
            />
          </div>
        )}
      </div>
    </Card>
  );
}