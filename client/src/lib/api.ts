import { apiRequest } from "./queryClient";
import { Document, DocumentImage, Message, ChatMessage } from "@shared/schema";
import { getFullUrl } from "./config";

// Interface for chat with knowledge base
export interface KnowledgeBaseChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  references?: Array<{
    type: "image" | "text";
    imagePath?: string;
    caption?: string;
    content?: string;
    id?: number;
  }>;
}

export interface KnowledgeBaseChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface KnowledgeItem {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}

// Upload document
export async function uploadDocument(file: File): Promise<{ document: Document, imageCount: number }> {
  const formData = new FormData();
  formData.append("document", file);

  const uploadUrl = getFullUrl("/api/documents/upload");
  
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload document: ${errorText}`);
  }

  return response.json();
}

// Get all documents
export async function getDocuments(): Promise<Document[]> {
  const response = await apiRequest("GET", "/api/documents");
  return response.json();
}

// Get document by ID with images and messages
export async function getDocumentById(id: number): Promise<{ document: Document, images: DocumentImage[], messages: Message[] }> {
  const response = await apiRequest("GET", `/api/documents/${id}`);
  return response.json();
}

// Get document images
export async function getDocumentImages(documentId: number): Promise<DocumentImage[]> {
  const response = await apiRequest("GET", `/api/documents/${documentId}/images`);
  return response.json();
}

// Get document messages
export async function getDocumentMessages(documentId: number): Promise<Message[]> {
  const response = await apiRequest("GET", `/api/documents/${documentId}/messages`);
  return response.json();
}

// Send a chat message and get AI response
export async function sendChatMessage(documentId: number, content: string): Promise<ChatMessage> {
  const response = await apiRequest("POST", `/api/documents/${documentId}/chat`, { content });
  return response.json();
}

// Note: Removed indexDocumentInPinecone and addKnowledgeToPinecone functions
// as we're only using the existing Pinecone index

// Chat with knowledge base (without document)
export async function chatWithKnowledgeBase(
  messages: KnowledgeBaseChatMessage[],
  options?: KnowledgeBaseChatOptions
): Promise<KnowledgeBaseChatMessage> {
  const payload = {
    messages,
    ...options
  };
  const response = await apiRequest("POST", "/api/chat", payload);
  return response.json();
}

// Generate a diagram directly (bypassing chat)
export async function generateDiagram(prompt: string, context: string = ""): Promise<{imagePath: string, altText: string}> {
  const response = await apiRequest("POST", "/api/generate-diagram", { 
    prompt,
    context
  });
  return response.json();
}

// Convert SVG to PNG using server-side processing
export async function convertSvgToPng(svgContent: string): Promise<string> {
  const response = await apiRequest("POST", "/api/convert-svg-to-png", { svgContent });
  const result = await response.json();
  return result.pngPath;
}

// Get screenshot of HTML diagram (extracts SVG server-side)
export async function getDiagramScreenshot(htmlFileName: string): Promise<Response> {
  // Extract just the filename from a full path if needed
  const fileName = htmlFileName.includes('/') 
    ? htmlFileName.split('/').pop() 
    : htmlFileName;
  
  // Use our new diagram-png endpoint that returns the PNG directly
  return fetch(getFullUrl(`/api/diagram-png/${fileName}`), {
    method: "GET",
    credentials: "include"
  });
}

// Convert mermaid file to PNG using server-side mmdc command
export async function convertMermaidToPng(mmdFileName: string): Promise<Response> {
  // Extract just the filename from a full path if needed
  const fileName = mmdFileName.includes('/') 
    ? mmdFileName.split('/').pop() 
    : mmdFileName;
  
  // Use the mmdc conversion endpoint
  return fetch(getFullUrl(`/api/convert-mermaid-to-png/${fileName}`), {
    method: "GET",
    credentials: "include"
  });
}
