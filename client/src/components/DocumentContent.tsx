import React from "react";
import { Document, DocumentImage, ChatMessage } from "@shared/schema";
import ChatContainer from "./ChatContainer";
import { useQuery } from "@tanstack/react-query";
import { getDocumentMessages } from "@/lib/api";

interface DocumentContentProps {
  document: Document | null;
  onImageSelect: (image: DocumentImage) => void;
  isMobile: boolean;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

const DocumentContent: React.FC<DocumentContentProps> = ({
  document,
  onImageSelect,
  isMobile,
  sidebarOpen,
  toggleSidebar,
}) => {
  // Fetch messages if document is loaded
  const { data: messages = [] } = useQuery({
    queryKey: ["/api/documents", document?.id, "messages"],
    queryFn: () => getDocumentMessages(document?.id || 0),
    enabled: !!document,
  });

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
      {/* Mobile Header */}
      {isMobile && (
        <div className="p-4 border-b border-gray-200 bg-white flex items-center">
          <button
            className="text-gray-600 hover:text-gray-800"
            onClick={toggleSidebar}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h2 className="text-base font-medium text-gray-800 ml-4">
            DocChat Assistant
          </h2>
        </div>
      )}

      {/* Chat Interface */}
      <ChatContainer
        document={document}
        messages={messages}
        onImageSelect={onImageSelect}
      />
    </div>
  );
};

export default DocumentContent;
