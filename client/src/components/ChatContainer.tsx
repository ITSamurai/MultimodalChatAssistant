import React, { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Document, DocumentImage, ChatMessage as ChatMessageType } from "@shared/schema";
import ChatMessage from "./ChatMessage";
import { sendChatMessage } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FoldVertical } from "lucide-react";

interface ChatContainerProps {
  document: Document | null;
  messages: ChatMessageType[];
  onImageSelect: (image: DocumentImage) => void;
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  document,
  messages,
  onImageSelect,
}) => {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto resize textarea based on content
  const autoResizeTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = "inherit";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  };

  // Handle sending message
  const sendMessageMutation = useMutation({
    mutationFn: ({ documentId, content }: { documentId: number; content: string }) => 
      sendChatMessage(documentId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents', document?.id, 'messages'] });
      setInputValue("");
      if (inputRef.current) {
        inputRef.current.style.height = "48px"; // Reset height
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!document || !inputValue.trim() || sendMessageMutation.isPending) return;
    
    sendMessageMutation.mutate({
      documentId: document.id,
      content: inputValue.trim(),
    });
  };

  // Show welcome screen if no document
  if (!document) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
        <div className="max-w-xl w-full bg-white rounded-xl shadow-sm p-6 md:p-8">
          <div className="text-center mb-6">
            <span className="inline-block text-accent text-4xl mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12"
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
            <h1 className="text-2xl font-bold text-gray-800">Welcome to DocChat</h1>
            <p className="text-gray-600 mt-2">Upload a document and ask questions about its content</p>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-blue-800 flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-blue-500 mr-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              How it works
            </h3>
            <ul className="mt-2 text-sm text-blue-700 space-y-2">
              <li className="flex items-start">
                <span className="inline-block w-5 text-center font-medium">1.</span>
                <span>Upload a Word document containing text and images</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-5 text-center font-medium">2.</span>
                <span>Ask questions about the document content</span>
              </li>
              <li className="flex items-start">
                <span className="inline-block w-5 text-center font-medium">3.</span>
                <span>Get detailed answers with relevant images from the document</span>
              </li>
            </ul>
          </div>

          <div className="hidden md:block text-center text-sm text-gray-500 mt-4">
            To get started, upload a document using the sidebar
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Chat Messages */}
      <ScrollArea className="flex-1 p-4 md:p-6">
        {messages.length === 0 ? (
          // System welcome message when document is loaded but no messages yet
          <ChatMessage
            message={{
              role: "system",
              content: `I've analyzed your document "${document.originalName}". What would you like to know about it?`,
            }}
            onImageClick={onImageSelect}
          />
        ) : (
          // Render all messages
          messages.map((message, index) => (
            <ChatMessage
              key={index}
              message={message}
              onImageClick={onImageSelect}
            />
          ))
        )}
        {/* Loading indicator when sending message */}
        {sendMessageMutation.isPending && (
          <div className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
            <svg
              className="animate-spin h-4 w-4 text-primary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <p>DocChat is thinking...</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* Chat Input */}
      <div className="border-t border-gray-200 bg-white p-4 md:p-6">
        <form onSubmit={handleSubmit} className="flex items-end space-x-3">
          <div className="flex-1 relative">
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                autoResizeTextarea(e);
              }}
              placeholder="Ask about the document..."
              className="w-full rounded-lg px-4 py-3 pr-12 resize-none min-h-12 max-h-36 transition"
              style={{
                borderColor: "rgba(145, 178, 242, 0.5)",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                color: "rgba(3, 23, 140, 0.7)"
              }}
              disabled={sendMessageMutation.isPending}
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="absolute right-3 bottom-3 text-primary hover:text-blue-700 transition"
              disabled={!inputValue.trim() || sendMessageMutation.isPending}
            >
              <FoldVertical className="h-5 w-5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatContainer;
