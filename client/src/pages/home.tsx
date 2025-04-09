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
import { Layout } from "@/components/Layout";

const Home = () => {
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
    <Layout>
      <div className="h-[calc(100vh-64px)] flex flex-col">
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
    </Layout>
  );
};

export default Home;
