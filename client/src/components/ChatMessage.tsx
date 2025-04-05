import React from "react";
import { ChatMessage as ChatMessageType, DocumentImage } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: ChatMessageType;
  onImageClick: (image: DocumentImage) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onImageClick }) => {
  const { role, content, references } = message;
  
  // Format message content to handle markdown-like elements
  const formattedContent = React.useMemo(() => {
    // Split content by lines
    const lines = content.split('\n');
    
    const formattedLines = lines.map((line, index) => {
      // Handle lists
      if (line.match(/^\d+\.\s/)) {
        return <li key={index} className="ml-6">{line.replace(/^\d+\.\s/, '')}</li>;
      }
      
      // Handle paragraphs
      if (line.trim() === '') {
        return <br key={index} />;
      }
      
      return <p key={index} className={index > 0 ? "mt-2" : ""}>{line}</p>;
    });
    
    return formattedLines;
  }, [content]);

  const isUserMessage = role === "user";
  const isSystemMessage = role === "system";
  const isAssistantMessage = role === "assistant";

  const hasReferences = references && references.length > 0;

  return (
    <div className={cn(
      "flex items-start mb-6",
      isUserMessage && "justify-end"
    )}>
      {!isUserMessage && (
        <Avatar className="h-8 w-8 mr-3">
          <AvatarFallback className={isSystemMessage ? "bg-gray-500" : "bg-accent"}>
            {isSystemMessage ? "S" : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 8c2.76 0 5-2.24 5-5H7c0 2.76 2.24 5 5 5z" />
                <path d="M8 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1" />
                <path d="M9 18c-1 0-1-1-1-1v-2h8v2s0 1-1 1" />
              </svg>
            )}
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn(
        "py-3 px-4 max-w-3xl rounded-lg",
        isUserMessage ? "bg-primary text-white" : "bg-white shadow-sm",
        isSystemMessage && "bg-gray-100"
      )}>
        {isUserMessage ? (
          <p>{content}</p>
        ) : (
          <div>
            <div className="text-gray-800">{formattedContent}</div>
            
            {hasReferences && (
              <div className="mt-3 space-y-3">
                {references.map((ref, index) => (
                  ref.type === 'image' && ref.imagePath && (
                    <div 
                      key={index} 
                      className="rounded-lg overflow-hidden border border-gray-200"
                      onClick={() => onImageClick({
                        id: ref.id || 0,
                        documentId: 0, // Will be filled by actual component
                        imagePath: ref.imagePath,
                        altText: ref.content || 'Document image',
                        caption: ref.caption || 'Figure from document',
                        pageNumber: null,
                      })}
                    >
                      <img 
                        src={ref.imagePath} 
                        alt={ref.content || 'Document image'} 
                        className="w-full object-cover max-h-60 object-center cursor-pointer" 
                      />
                      <div className="bg-gray-50 p-2 text-xs text-gray-500">
                        {ref.caption || 'Image from document'}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isUserMessage && (
        <Avatar className="h-8 w-8 ml-3">
          <AvatarFallback className="bg-gray-200 text-gray-700">JS</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

export default ChatMessage;
