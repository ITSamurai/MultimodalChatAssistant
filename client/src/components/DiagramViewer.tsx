import React, { useState, useEffect, useRef, useMemo } from "react";
import { ZoomIn, ZoomOut, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFullUrl } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";

interface DiagramViewerProps {
  diagramPath: string;
  altText?: string;
}

/**
 * A completely rewritten Draw.io diagram viewer component with proper:
 * - Mouse dragging (preserves zoom level)
 * - Zoom controls
 * - Download as PNG functionality
 * - Aggressive caching prevention mechanisms
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

  // For dragging functionality
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Constants for zoom
  const minZoom = 0.2;
  const maxZoom = 3;
  const zoomStep = 0.1;

  // Generate a unique key for this component instance
  // This helps prevent caching at multiple levels
  const uniqueKey = useMemo(
    () => `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
    [],
  );

  // Log the diagram path for debugging
  useEffect(() => {
    console.log(
      `DiagramViewer rendering with path: ${diagramPath}, unique key: ${uniqueKey}`,
    );
  }, [diagramPath, uniqueKey]);

  // Load SVG content with aggressive cache busting
  useEffect(() => {
    const loadSvg = async () => {
      setLoading(true);
      setError(null);
      setSvgContent(""); // Clear existing content

      try {
        // Extract base filename (without extension) and strip any existing query params
        const pathWithoutParams = diagramPath.split("?")[0];
        const baseFilename = pathWithoutParams.replace(
          /\.(html|xml|drawio)$/,
          "",
        );

        // Get just the filename part, not the full path
        const filenameOnly = baseFilename.split("/").pop() || baseFilename;

        // Ultra-aggressive cache busting with timestamp, random value, and unique key
        const cacheBuster = `t=${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${uniqueKey}`;

        // Attempt to load SVG with ultra-strong cache-busting
        const svgUrl = getFullUrl(
          `/api/diagram-svg/${filenameOnly}.drawio?${cacheBuster}`,
        );
        console.log("Loading diagram from:", svgUrl);

        // Use multiple techniques to prevent caching
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(svgUrl, {
          method: "GET",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
            "X-Requested-With": uniqueKey, // Custom header to help bypass CDN caches
          },
          credentials: "same-origin",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Failed to load diagram (${response.status})`);
        }

        const svgText = await response.text();
        // Check if content has proper SVG elements
        if (!svgText || svgText.trim() === "" || !svgText.includes("<svg")) {
          console.error(
            "Invalid SVG content received:",
            svgText ? svgText.substring(0, 100) + "..." : "empty",
          );
          throw new Error("Invalid SVG content received from server");
        }

        // Clean up any existing SVG content to force a fresh render
        const containerElement = containerRef.current;
        if (containerElement) {
          while (containerElement.firstChild) {
            containerElement.removeChild(containerElement.firstChild);
          }
        }

        // Store the SVG content with a slight delay to ensure DOM is ready and fresh render
        setSvgContent(""); // Clear first to force re-render
        setTimeout(() => {
          setSvgContent(svgText);
          setLoading(false);

          // After another small delay, check if the SVG content was properly rendered
          setTimeout(() => {
            const svgElements = containerRef.current?.querySelectorAll("svg");
            if (!svgElements || svgElements.length === 0) {
              console.error("SVG not rendered properly, trying again...");
              // Try one more time
              setSvgContent("");
              setTimeout(() => setSvgContent(svgText), 100);
            } else {
              console.log(
                "SVG rendered successfully with",
                svgElements.length,
                "elements",
              );
            }
          }, 300);
        }, 100);

        // Initialize zoom from localStorage or use default of 0.7
        const savedZoom = localStorage.getItem("diagram_zoom_level");
        if (savedZoom && !isNaN(parseFloat(savedZoom))) {
          setZoom(parseFloat(savedZoom));
        }
      } catch (err) {
        console.error("Error loading diagram:", err);
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load diagram");

        // Try one more time with a delay if it was a network error
        if (err instanceof Error && err.name === "AbortError") {
          setTimeout(() => {
            console.log("Retrying diagram load after timeout...");
            loadSvg();
          }, 2000);
        }
      }
    };

    loadSvg();
  }, [diagramPath, uniqueKey]);

  // Save zoom level to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem("diagram_zoom_level", zoom.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [zoom]);

  // Handle mouse events for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0) return;

    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });

    // Prevent text selection while dragging
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle zoom controls
  const zoomIn = () => {
    setZoom((prevZoom) => Math.min(maxZoom, prevZoom + zoomStep));
  };

  const zoomOut = () => {
    setZoom((prevZoom) => Math.max(minZoom, prevZoom - zoomStep));
  };

  const resetZoom = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  // Handle PNG download
  const downloadAsPng = async () => {
    try {
      // Extract base filename (without extension) and strip any existing query params
      const pathWithoutParams = diagramPath.split("?")[0];
      const baseFilename = pathWithoutParams.replace(
        /\.(html|xml|drawio)$/,
        "",
      );

      // Get just the filename part, not the full path
      const filenameOnly = baseFilename.split("/").pop() || baseFilename;

      // More aggressive cache busting with timestamp and random value
      const cacheBuster = `t=${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${uniqueKey}`;

      // Create download URL with cache busting
      const downloadUrl = getFullUrl(
        `/api/download-full-diagram/${filenameOnly}?${cacheBuster}`,
      );
      console.log("Downloading diagram from:", downloadUrl);

      // Create temporary link and trigger download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "rivermeadow_diagram.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download Started",
        description: "Your diagram PNG is being downloaded.",
      });
    } catch (err) {
      console.error("Error downloading PNG:", err);
      toast({
        title: "Download Failed",
        description:
          "There was an error downloading the PNG. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Using a constant diagram type instead of extracting from path
  const diagramType = "Migration";

  // Fallback image URL construction based on path
  const getFallbackImageUrl = (): string => {
    // This uses the rivermeadow_diagram_1746107014375.png image we have in attached_assets
    return getFullUrl("/attached_assets/rivermeadow_diagram_1746107014375.png");
  };
  console.log(svgContent);
  return (
    <div className="flex flex-col w-full bg-white rounded-lg shadow-sm my-4 overflow-hidden">
      <div className="flex justify-between items-center p-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-base font-medium text-gray-800 m-0">
          RiverMeadow {diagramType} Diagram
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={zoomOut}
            title="Zoom Out"
            className="flex items-center justify-center"
          >
            <ZoomOut size={18} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resetZoom}
            title="Reset Zoom"
            className="flex items-center justify-center"
          >
            {Math.round(zoom * 100)}%
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={zoomIn}
            title="Zoom In"
            className="flex items-center justify-center"
          >
            <ZoomIn size={18} />
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={downloadAsPng}
            className="flex items-center justify-center"
          >
            <Download size={18} className="mr-1" />
            Download PNG
          </Button>
        </div>
      </div>

      <div className="relative h-[500px] overflow-hidden bg-white">
        {loading && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 text-gray-600">
            <RefreshCw className="animate-spin" size={24} />
            <span>Loading diagram...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-red-600 text-center">
            <p className="mb-3">Error loading diagram SVG: {error}</p>
            <p className="text-sm text-gray-500 mb-4">
              Displaying fallback diagram image
            </p>

            {/* Fallback image that uses the RiverMeadow diagram from attached assets */}
            <div className="relative w-full max-w-[90%] h-[300px] overflow-hidden border border-gray-200 rounded-lg">
              <img
                src={getFallbackImageUrl()}
                alt={`${diagramType} diagram`}
                className="object-contain w-full h-full"
              />
            </div>
          </div>
        )}

        {!error && (
          <div
            ref={containerRef}
            className={`absolute top-0 left-0 w-full h-full select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transformOrigin: "center",
              transition: isDragging ? "none" : "transform 0.1s ease-out",
            }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .cursor-grab { cursor: grab; }
        .cursor-grabbing { cursor: grabbing; }
        
        /* Make sure all SVG elements don't capture pointer events */
        svg, svg * {
          pointer-events: none !important;
        }
      `,
        }}
      />
    </div>
  );
}
