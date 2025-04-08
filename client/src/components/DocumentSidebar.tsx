import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Document, DocumentImage } from "@shared/schema";
import { getDocumentImages } from "@/lib/api";
import FileUpload from "./ui/file-upload";
import ImageGrid from "./ImageGrid";

interface DocumentSidebarProps {
  document: Document | null;
  onFileUpload: (file: File) => Promise<void>;
  onImageSelect: (image: DocumentImage) => void;
  isUploading: boolean;
}

const DocumentSidebar: React.FC<DocumentSidebarProps> = ({
  document,
  onFileUpload,
  onImageSelect,
  isUploading,
}) => {
  // Get document images if document is loaded
  const { data: images = [] } = useQuery({
    queryKey: ["/api/documents", document?.id, "images"],
    queryFn: () => getDocumentImages(document?.id || 0),
    enabled: !!document,
  });

  // Parse and structure document content for section navigation
  const sections = React.useMemo(() => {
    if (!document?.contentText) return [];
    
    // Simple parsing of document sections (this is basic - could be enhanced)
    // Looks for lines that seem like headings
    const lines = document.contentText.split("\n").filter(line => line.trim());
    const potentialHeadings = lines.filter(line => line.trim().length < 100 && !line.endsWith("."));
    
    return potentialHeadings.slice(0, 10).map((line, index) => ({
      id: index + 1,
      title: line.trim()
    }));
  }, [document]);

  const isDocumentLoaded = !!document;

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex-shrink-0 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Documents</h2>
        <FileUpload
          onFileSelected={onFileUpload}
          acceptedFileTypes=".doc,.docx,.pdf"
          isLoading={isUploading}
        />
      </div>

      {isDocumentLoaded ? (
        <ScrollArea className="flex-1">
          {/* Document Info */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-start">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5 text-blue-500 mt-1" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-gray-900">{document.originalName}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Uploaded: {new Date(document.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Document Contents */}
          {sections.length > 0 && (
            <div className="p-2">
              <h4 className="px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Content
              </h4>
              {sections.map((section) => (
                <div 
                  key={section.id}
                  className="mt-1 px-2 py-2 rounded-md hover:bg-gray-100 cursor-pointer"
                >
                  <div className="flex items-center">
                    <span className="text-xs text-gray-500 font-medium">{section.id}.</span>
                    <p className="ml-2 text-sm text-gray-800 truncate">{section.title}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Images Section */}
          {images.length > 0 && (
            <div className="p-2 border-t border-gray-200 mt-2">
              <h4 className="px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Images
              </h4>
              <ImageGrid images={images} onImageSelect={onImageSelect} />
            </div>
          )}
        </ScrollArea>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 p-4">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-10 w-10 text-gray-300 mb-2" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M5 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M2 15v-3a2 2 0 0 1 2-2h6" />
          </svg>
          <p className="text-sm text-gray-500 text-center">No document uploaded yet</p>
          <p className="text-xs text-gray-400 text-center mt-1">Upload a document to start analyzing</p>
        </div>
      )}
    </div>
  );
};

export default DocumentSidebar;
