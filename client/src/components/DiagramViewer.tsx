import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, ZoomIn, ZoomOut, RefreshCw, AlertTriangle } from 'lucide-react';

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
  const [svgContent, setSvgContent] = useState<string | null>(null);

  // Load the diagram
  useEffect(() => {
    setIsLoading(true);
    setError(null);
    
    // If the path doesn't start with http or /, add the api prefix
    let finalUrl = diagramPath;
    if (!diagramPath.startsWith('http') && !diagramPath.startsWith('/api/')) {
      if (diagramPath.startsWith('/')) {
        finalUrl = `/api${diagramPath}`;
      } else {
        finalUrl = `/api/${diagramPath}`;
      }
    }
    
    // Debug info about the url construction
    console.log({
      original: diagramPath,
      final: finalUrl,
      startsWithSlash: diagramPath.startsWith('/'),
      startsWithApiSlash: diagramPath.startsWith('/api/')
    });
    
    console.log('Loading diagram from:', finalUrl);
    setImageUrl(finalUrl);
    
    // Determine if this is an SVG file
    const isSvg = finalUrl.includes('.svg');
    
    if (isSvg) {
      // Fetch the SVG content directly
      fetch(finalUrl)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to fetch SVG: ${response.status} ${response.statusText}`);
          }
          return response.text();
        })
        .then(svgText => {
          console.log('SVG content length:', svgText.length);
          setSvgContent(svgText);
          setIsLoading(false);
        })
        .catch(err => {
          console.error('Error fetching SVG:', err);
          setError(`Error loading SVG: ${err.message}`);
          setIsLoading(false);
        });
    } else {
      // For non-SVG images, just use the regular image tag
      setSvgContent(null);
      // Short timeout to simulate loading
      setTimeout(() => setIsLoading(false), 500);
    }
    
    return () => {
      // Cleanup
    };
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
            <div className="text-xs text-gray-500 mb-2">Debug: Loading from {imageUrl}</div>
            
            {svgContent ? (
              <div
                style={{ 
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.2s ease-in-out',
                  border: '1px solid #eee',
                  minWidth: '300px',
                  minHeight: '200px',
                  padding: '10px',
                  backgroundColor: 'white'
                }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            ) : (
              <img 
                src={imageUrl} 
                alt={altText}
                style={{ 
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.2s ease-in-out',
                  border: '1px solid #eee',
                  minWidth: '300px',
                  minHeight: '200px'
                }}
                onError={(e) => {
                  console.error('Image loading error:', e);
                  setError(`Failed to load diagram from ${imageUrl}`);
                }}
              />
            )}
            
            {/* Error badge if SVG is loaded but seems empty */}
            {svgContent && svgContent.length < 100 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md flex items-center text-sm">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
                <span>The SVG content seems incomplete. Try regenerating the diagram.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}