import OpenAI from "openai";
import { ChatMessage, OpenAICompletionRequest, OpenAICompletionResponse } from "@shared/schema";
import { storage } from "../storage";

// Initialize OpenAI client
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
const DEFAULT_MODEL = "gpt-4o";

// System prompt template
const SYSTEM_PROMPT = `You are a document analysis assistant. You have access to a document with text content and images.
Analyze the document content to provide accurate and helpful responses.
When the user asks about visual elements, include references to the relevant images in your response.
Be concise but thorough in your answers, and always cite the specific sections or images you're referencing.`;

// Process a user message and get AI response
export const processMessage = async (
  documentId: number,
  userMessage: string
): Promise<ChatMessage> => {
  try {
    // Get document data
    const document = await storage.getDocument(documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    // Get document images
    const images = await storage.getDocumentImages(documentId);
    
    // Get previous messages
    const previousMessages = await storage.getMessages(documentId);

    // Format the context for OpenAI
    const contextMessages = [
      {
        role: "system" as const,
        content: SYSTEM_PROMPT + `\n\nDocument Title: ${document.name}\n\nDocument Content:\n${document.contentText.substring(0, 8000)}...`,
      },
    ];

    // Add previous messages (up to a reasonable amount)
    const recentMessages = previousMessages.slice(-10);
    recentMessages.forEach((msg) => {
      contextMessages.push({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      });
    });

    // Add the current user message
    contextMessages.push({
      role: "user" as const,
      content: userMessage,
    });

    // Save user message to storage
    const userMessageData = {
      documentId,
      content: userMessage,
      role: "user" as const,
      references: null,
    };
    await storage.createMessage(userMessageData);

    // Send the request to OpenAI
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: contextMessages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    // Process the response
    const aiMessage = response.choices[0].message.content;
    
    // Analyze response to see if it references images
    const imageReferences = [];
    for (const image of images) {
      // Simple heuristic: check if image caption or alt text is mentioned
      if (image.caption && aiMessage.includes(image.caption)) {
        imageReferences.push({
          type: "image",
          id: image.id,
          imagePath: image.imagePath,
          caption: image.caption,
        });
      } else if (image.altText && aiMessage.includes(image.altText)) {
        imageReferences.push({
          type: "image",
          id: image.id,
          imagePath: image.imagePath,
          caption: image.altText,
        });
      }
    }

    // Check for image references using figure numbers
    const figureRegex = /figure\s+(\d+)/gi;
    let match;
    while ((match = figureRegex.exec(aiMessage)) !== null) {
      const figureNumber = parseInt(match[1]);
      // Find image with matching figure number (from caption)
      const matchingImage = images.find(img => 
        img.caption && img.caption.toLowerCase().includes(`figure ${figureNumber}`)
      );
      
      if (matchingImage && !imageReferences.some(ref => ref.id === matchingImage.id)) {
        imageReferences.push({
          type: "image",
          id: matchingImage.id,
          imagePath: matchingImage.imagePath,
          caption: matchingImage.caption,
        });
      }
    }

    // Save assistant message with references
    const assistantMessageData = {
      documentId,
      content: aiMessage,
      role: "assistant" as const,
      references: imageReferences.length > 0 ? imageReferences : null,
    };
    
    const savedMessage = await storage.createMessage(assistantMessageData);

    // Format the response
    return {
      id: savedMessage.id,
      content: aiMessage,
      role: "assistant",
      timestamp: savedMessage.timestamp,
      references: imageReferences,
    };
  } catch (error) {
    console.error("Error processing message with OpenAI:", error);
    throw new Error(`Failed to process message: ${error.message}`);
  }
};
