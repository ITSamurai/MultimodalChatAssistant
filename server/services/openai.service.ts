import OpenAI from "openai";
import { ChatMessage, DocumentImage, OpenAICompletionRequest, OpenAICompletionResponse } from "@shared/schema";
import { storage } from "../storage";

// Initialize OpenAI client
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
const DEFAULT_MODEL = "gpt-4o";

// System prompt template with enhanced image handling
const SYSTEM_PROMPT = `You are a document analysis assistant. You have access to a document with text content and images.
Analyze the document content to provide accurate and helpful responses.

IMPORTANT INSTRUCTIONS FOR HANDLING IMAGES - FOLLOW THESE EXACTLY:
1. When the user asks about diagrams, charts, or any visual elements, you MUST include references to the relevant images.
2. For ALL images you reference, use the EXACT format: "Figure X" where X is the figure number.
3. When the user specifically requests to see diagrams, charts, figures, or visual elements, you MUST reference at least one image.
4. When describing a diagram, ALWAYS begin by saying "Here is the diagram:" or "This diagram shows:" followed by your description.
5. If the document has images/figures/charts/diagrams, mention them in your response when they are relevant to the question.
6. NEVER invent or make up figures that don't exist in the document.

Be concise yet thorough in your answers, and always cite the specific sections or images you're referencing from the document.`;

// Type definitions for image references
interface ImageReference {
  type: "image";
  id: number;
  imagePath: string;
  caption: string;
}

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
    const contextMessages: Array<{role: "system" | "user" | "assistant", content: string}> = [
      {
        role: "system",
        content: SYSTEM_PROMPT + `\n\nDocument Title: ${document.name}\n\nDocument Content:\n${document.contentText.substring(0, 8000)}...`,
      },
    ];

    // Add previous messages (up to a reasonable amount)
    const recentMessages = previousMessages.slice(-10);
    recentMessages.forEach((msg) => {
      const role: "system" | "user" | "assistant" = 
        (msg.role === "user" || msg.role === "assistant" || msg.role === "system") 
          ? msg.role as "system" | "user" | "assistant"
          : "assistant";
          
      contextMessages.push({
        role,
        content: msg.content || "",
      });
    });

    // Add the current user message
    contextMessages.push({
      role: "user",
      content: userMessage,
    });

    // Save user message to storage
    const userMessageData = {
      documentId,
      content: userMessage,
      role: "user",
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
    const aiMessage = response.choices[0].message.content || "";
    
    // Analyze response to see if it references images
    const imageReferences: ImageReference[] = [];
    
    // Enhanced image reference detection
    console.log(`Analyzing response for image references. Available images: ${images.length}`);
    
    // 1. First check if user is specifically asking for diagrams or images
    const isUserAskingForImages = userMessage.toLowerCase().includes('diagram') || 
                                userMessage.toLowerCase().includes('image') || 
                                userMessage.toLowerCase().includes('figure') ||
                                userMessage.toLowerCase().includes('chart') ||
                                userMessage.toLowerCase().includes('graph') ||
                                userMessage.toLowerCase().includes('picture') ||
                                userMessage.toLowerCase().includes('illustration') ||
                                userMessage.toLowerCase().includes('show me') ||
                                userMessage.toLowerCase().includes('visual');
    
    // 2. Check for direct figure references in the AI's response
    const figureRegex = /figure\s+(\d+)/gi;
    let match;
    const mentionedFigures = new Set<number>();
    
    while ((match = figureRegex.exec(aiMessage)) !== null) {
      const figureNumber = parseInt(match[1]);
      mentionedFigures.add(figureNumber);
      
      // Find image with matching figure number
      const matchingImage = images.find(img => {
        if (!img.caption) return false;
        
        // Check for exact figure number match in caption
        const captionFigureMatch = img.caption.match(/figure\s+(\d+)/i);
        if (captionFigureMatch && parseInt(captionFigureMatch[1]) === figureNumber) {
          return true;
        }
        
        // Try to extract figure number from caption if it's in format "Figure X: ..."
        return img.caption.toLowerCase().includes(`figure ${figureNumber}`);
      });
      
      if (matchingImage && !imageReferences.some(ref => ref.id === matchingImage.id)) {
        imageReferences.push({
          type: "image",
          id: matchingImage.id,
          imagePath: matchingImage.imagePath,
          caption: matchingImage.caption || `Figure ${figureNumber}`,
        });
      }
    }
    
    // 3. If AI mentions showing a diagram or image but no specific figure was referenced,
    // or if user asked for images but none were referenced, include relevant images
    if ((aiMessage.toLowerCase().includes('here is the diagram') || 
         aiMessage.toLowerCase().includes('this diagram shows') ||
         aiMessage.toLowerCase().includes('see the figure') ||
         aiMessage.toLowerCase().includes('as shown in') ||
         isUserAskingForImages) && imageReferences.length === 0 && images.length > 0) {
      
      console.log("User is asking for images or response mentions diagrams, adding references...");
      
      // For debugging, log all available images
      console.log("Available images:", images.map(img => ({ 
        id: img.id, 
        caption: img.caption, 
        path: img.imagePath 
      })));
      
      // Add all available images when explicitly asked for images
      if (isUserAskingForImages) {
        for (const image of images) {
          imageReferences.push({
            type: "image",
            id: image.id,
            imagePath: image.imagePath,
            caption: image.caption || "Document image",
          });
          
          // Limit to 3 images if there are many
          if (imageReferences.length >= 3) break;
        }
        
        console.log(`Added ${imageReferences.length} images as requested by user`);
      } else {
        // Just add the first image when AI mentions a diagram
        const firstImage = images[0];
        imageReferences.push({
          type: "image",
          id: firstImage.id,
          imagePath: firstImage.imagePath,
          caption: firstImage.caption || "Document image",
        });
        
        console.log("Added first image as fallback");
      }
    }
    
    // 4. Also check for mentions of image captions
    for (const image of images) {
      if (image.caption && aiMessage.includes(image.caption) && 
          !imageReferences.some(ref => ref.id === image.id)) {
        imageReferences.push({
          type: "image",
          id: image.id,
          imagePath: image.imagePath,
          caption: image.caption,
        });
      } else if (image.altText && aiMessage.includes(image.altText) && 
                !imageReferences.some(ref => ref.id === image.id)) {
        imageReferences.push({
          type: "image",
          id: image.id,
          imagePath: image.imagePath,
          caption: image.altText || "",
        });
      }
    }

    // Save assistant message with references
    const assistantMessageData = {
      documentId,
      content: aiMessage,
      role: "assistant",
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
  } catch (error: any) {
    console.error("Error processing message with OpenAI:", error);
    throw new Error(`Failed to process message: ${error.message}`);
  }
};
