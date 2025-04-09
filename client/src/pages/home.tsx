import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Document, DocumentImage } from "@shared/schema";
import { uploadDocument } from "@/lib/api";
import DocumentSidebar from "@/components/DocumentSidebar";
import DocumentContent from "@/components/DocumentContent";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useToast } from "@/hooks/use-toast";
import { useMobile } from "@/hooks/use-mobile";
import { Link } from "wouter";

const Home: React.FC = () => {
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [selectedImage, setSelectedImage] = useState<DocumentImage | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useMobile();

  // Handle document upload
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDocument(file),
    onSuccess: (data) => {
      setCurrentDocument(data.document);
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({
        title: "Document uploaded successfully",
        description: `Extracted ${data.imageCount} images from the document.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (file: File) => {
    uploadMutation.mutate(file);
  };

  const handleImageSelect = (image: DocumentImage) => {
    setSelectedImage(image);
    setImageModalOpen(true);
  };

  const closeImageModal = () => {
    setImageModalOpen(false);
    setSelectedImage(null);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-accent text-2xl">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <circle cx="9" cy="10" r="1" />
                <circle cx="15" cy="10" r="1" />
              </svg>
            </span>
            <h1 className="text-xl font-semibold">DocChat</h1>
          </div>

          {/* Navigation and User Menu */}
          <div className="flex items-center">
            <Link href="/knowledge-chat" className="flex items-center px-3 py-2 text-sm font-medium text-primary rounded-md bg-primary-foreground/20 hover:bg-primary-foreground/30 mr-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              RiverMeadow AI Chat
            </Link>
            <button className="text-gray-600 hover:text-gray-800 ml-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center ml-4">
              <span className="text-sm font-medium text-gray-700">JS</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - hidden on mobile unless toggled */}
        <div
          className={`${
            isMobile ? (sidebarOpen ? "block" : "hidden") : "block"
          } md:block transition-all`}
        >
          <DocumentSidebar
            document={currentDocument}
            onFileUpload={handleFileUpload}
            onImageSelect={handleImageSelect}
            isUploading={uploadMutation.isPending}
          />
        </div>

        {/* Main Content Area */}
        <DocumentContent
          document={currentDocument}
          onImageSelect={handleImageSelect}
          isMobile={isMobile}
          sidebarOpen={sidebarOpen}
          toggleSidebar={toggleSidebar}
        />
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        image={selectedImage}
        isOpen={imageModalOpen}
        onClose={closeImageModal}
      />

      {/* Loading Overlay */}
      <LoadingOverlay isVisible={uploadMutation.isPending} />
    </div>
  );
};

export default Home;
