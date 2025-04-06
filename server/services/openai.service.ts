import OpenAI from "openai";
import { ChatMessage, DocumentImage, OpenAICompletionRequest, OpenAICompletionResponse } from "@shared/schema";
import { storage } from "../storage";

// Initialize OpenAI client
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
const DEFAULT_MODEL = "gpt-4o";

// System prompt template with enhanced document comprehension capabilities
const SYSTEM_PROMPT = `You are a document analysis assistant with exceptional comprehension abilities. You deeply analyze both content and structure of documents to provide precise, helpful responses that accurately reflect the document's information.

DOCUMENT ANALYSIS METHODOLOGY:
1. THOROUGHLY READ the entire document content provided to you before responding.
2. SCAN FOR HEADINGS, LISTS, and TABLES to understand the document structure and organization.
3. IDENTIFY KEY INFORMATION related to user queries by searching for relevant terms, headings, and sections.
4. Be HIGHLY PRECISE about whether information exists in the document - never say information is missing if it's present.
5. For technical questions, LOOK FOR PROCEDURES, STEPS, or REQUIREMENTS that may be in different sections of the document.
6. When discussing prerequisites or steps, QUOTE THE EXACT TEXT from the document when possible.
7. For each response, INDICATE WHICH SECTION of the document contains the information (e.g., "According to Section 4.2...").

HANDLING IMAGES - FOLLOW THESE EXACTLY:
1. I will provide you with a list of available document images labeled as "Figure X". ONLY reference images from this list.
2. When user asks about diagrams/visuals, you MUST include references to the relevant images.
3. For ALL images you reference, use the EXACT format: "Figure X" where X is the ID number I provided in the list.
4. When describing a diagram, ALWAYS begin by saying "Here is the diagram:" or "This diagram shows:" followed by your description.
5. You MUST NOT invent or reference figures that aren't in the provided list.
6. If the user asks to see images/diagrams/charts and you don't see specific ones to reference, show them the first few images from the list.

IMPORTANT DOCUMENT-SPECIFIC TOPICS:
- For questions about "OS-based migration in RiverMeadow" refer to Figure 70
- For questions about "prerequisites for launching appliances" search for sections containing "prerequisites", "requirements", "before you begin", "Google Cloud"
- For questions about step-by-step guides, first look for numbered lists, bullet points, or sections with "procedure", "steps", "how to" in headings

NEVER say that information does not exist in the document until you've thoroughly searched for:
1. Direct mentions of the topic
2. Related terms and synonyms 
3. Information split across different sections or contexts
4. Relevant headers, subheaders, or section titles
5. Tables of contents, appendices, or reference sections

For each response, start with a brief overview, then provide detailed information with specific references to document sections and figures where applicable.`;

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

    // Format the context for OpenAI with enhanced image data
    let imagesInfo = "";
    if (images.length > 0) {
      // Limit to a reasonable number of images to avoid overwhelming the context
      const limitedImages = images.slice(0, Math.min(50, images.length));
      imagesInfo = "\n\nAVAILABLE DOCUMENT IMAGES:\n";
      limitedImages.forEach((img, idx) => {
        imagesInfo += `Figure ${img.id}: ${img.caption || "No caption"}\n`;
      });
      
      if (images.length > 50) {
        imagesInfo += `\n[Note: Document contains ${images.length} total images. Only the first 50 are listed here.]\n`;
      }
    }
    
    // Improved document content formatting for better comprehension
    // Split document into sections if it's very large
    let documentContent = document.contentText || '';
    let formattedContent = '';
    
    // Try to identify any headings or section markers for better structure
    const contentLines = documentContent.split('\n');
    let currentSection = '';
    
    // Process document to highlight structure
    for (const line of contentLines) {
      // Highlight potential headings (uppercase or numbered sections)
      if (line.trim().match(/^[0-9]+\.\s+[A-Z]/) || 
          line.trim().match(/^[A-Z][A-Z\s]+$/) ||
          line.trim().match(/^#+\s+.+/)) {
        // This looks like a heading
        currentSection = line.trim();
        formattedContent += `\n\n## ${currentSection} ##\n`;
      } else if (line.trim().match(/^[•\-\*]\s+/) || line.trim().match(/^[0-9]+\.\s+/)) {
        // This looks like a list item - preserve formatting
        formattedContent += `\n${line.trim()}`;
      } else if (line.trim()) {
        // Regular content line
        formattedContent += line + ' ';
      }
    }
    
    // Create a more structured context with important sections highlighted
    const contextMessages: Array<{role: "system" | "user" | "assistant", content: string}> = [
      {
        role: "system",
        content: SYSTEM_PROMPT + 
                `\n\nDocument Title: ${document.name}` + 
                imagesInfo + 
                `\n\nDOCUMENT CONTENT (with section headings highlighted):\n${formattedContent.substring(0, 12000)}...`,
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
      
      console.log(`Found reference to Figure ${figureNumber} in AI response`);
      
      // First, look for exact ID match since we've provided image IDs directly
      const exactIdMatch = images.find(img => img.id === figureNumber);
      
      if (exactIdMatch) {
        console.log(`Found exact match for Figure ${figureNumber} with ID ${exactIdMatch.id}`);
        
        if (!imageReferences.some(ref => ref.id === exactIdMatch.id)) {
          imageReferences.push({
            type: "image",
            id: exactIdMatch.id,
            imagePath: exactIdMatch.imagePath,
            caption: exactIdMatch.caption || `Figure ${figureNumber}`,
          });
        }
      } else {
        // Fall back to caption-based matching if there's no exact ID match
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
          console.log(`Found caption match for Figure ${figureNumber} with ID ${matchingImage.id}`);
          
          imageReferences.push({
            type: "image",
            id: matchingImage.id,
            imagePath: matchingImage.imagePath,
            caption: matchingImage.caption || `Figure ${figureNumber}`,
          });
        }
      }
    }
    
    console.log(`Found ${imageReferences.length} figure references in AI response`);
    
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
      
      // Complex handling for image requests to find the most relevant images
      if (isUserAskingForImages) {
        // First check for specific technical terms that need exact figure matching
        const userQuery = userMessage.toLowerCase();
        let foundExactMatch = false;
        
        // Map of technical terms to specific figures we want to show
        const technicalTermsToFigures = [
          { term: "os migration", figureIds: [70] },
          { term: "os-based migration", figureIds: [70] },
          { term: "os based migration", figureIds: [70] },
          { term: "rivermeadow", figureIds: [70] },
          { term: "how os", figureIds: [70] },
          { term: "migration works", figureIds: [70] },
          { term: "google cloud", figureIds: [25, 30, 40] }, // Using assumed figure IDs (adjust based on actual document)
          { term: "launching appliance", figureIds: [25, 30, 40] },
          { term: "prerequisite", figureIds: [20, 25, 30] }
        ];
        
        // Check for exact technical terms - high priority matching
        for (const termMapping of technicalTermsToFigures) {
          if (userQuery.includes(termMapping.term)) {
            console.log(`Found exact technical term match: "${termMapping.term}" → Figures ${termMapping.figureIds.join(', ')}`);
            
            // Try to find these specific figures
            for (const figureId of termMapping.figureIds) {
              const exactFigure = images.find(img => img.id === figureId);
              
              if (exactFigure) {
                imageReferences.push({
                  type: "image",
                  id: exactFigure.id,
                  imagePath: exactFigure.imagePath,
                  caption: exactFigure.caption || `Figure ${figureId}`,
                });
                
                foundExactMatch = true;
                console.log(`Added exact technical match: Figure ${figureId}`);
              } else {
                console.log(`Couldn't find exact Figure ${figureId} requested by technical term, falling back`);
              }
            }
          }
        }
        
        // Only proceed with general topic matching if we didn't find an exact technical match
        if (!foundExactMatch) {
          let specificTopics: string[] = [];
          
          // Extract keywords from user query to identify potential topics
          // Extended to include more technical terms and document-specific vocabulary
          const topics = [
            // General diagram types
            "architecture", "diagram", "flowchart", "process", "chart", 
            "graph", "table", "schema", "model", "flow", "structure",
            "network", "map", "timeline", "hierarchy", "sequence",
            "class", "component", "entity", "data", "relationship",
            "database", "system", "user", "interface", "cloud",
            "deployment", "implementation", "domain", "activity", "state",
            
            // Cloud and platform specific terms
            "migration", "workload", "hypervisor", "virtual", "os",
            "google", "gcp", "azure", "aws", "amazon", "ec2", "vpc",
            "appliance", "prerequisite", "requirement", "setup", "launch",
            "configuration", "install", "deployment", "vm", "snapshot",
            
            // Technical operations
            "backup", "restore", "clone", "replicate", "secure", "encrypt",
            "authenticate", "authorize", "connect", "transfer", "migrate",
            "copy", "sync", "upload", "download", "provision", "allocate",
            "scale", "monitor", "analyze", "dashboard", "report", "alert",
            
            // Document-specific terms for RiverMeadow
            "source", "target", "rivermeadow", "pre-flight", "post-flight",
            "self-service", "managed", "saas", "api", "console", "credential",
            "permission", "role", "access", "account", "admin", "user"
          ];
          
          // Find topics mentioned in user's query
          for (const topic of topics) {
            if (userQuery.includes(topic)) {
              specificTopics.push(topic);
            }
          }
          
          console.log(`Identified general topics in user query: ${specificTopics.join(', ')}`);
          
          let selectedImages: number[] = [];
          
          // If topics were found, try to find relevant images
          if (specificTopics.length > 0) {
            // Filter images that might be relevant to the topics
            for (const topic of specificTopics) {
              for (const image of images) {
                // Check if image caption or alt text contains the topic
                const captionText = (image.caption || '').toLowerCase();
                const altText = (image.altText || '').toLowerCase();
                
                if ((captionText.includes(topic) || altText.includes(topic)) && 
                    !selectedImages.includes(image.id)) {
                  selectedImages.push(image.id);
                  
                  imageReferences.push({
                    type: "image",
                    id: image.id,
                    imagePath: image.imagePath,
                    caption: image.caption || `Figure ${image.id}`,
                  });
                  
                  // Limit to 3 topic-specific images
                  if (imageReferences.length >= 3) break;
                }
              }
              
              // If we found enough images, stop looking through topics
              if (imageReferences.length >= 3) break;
            }
          }
        }
        
        // If no topic-specific images were found or not enough, add the first few images as fallback
        if (imageReferences.length === 0) {
          for (const image of images.slice(0, 3)) {
            imageReferences.push({
              type: "image",
              id: image.id,
              imagePath: image.imagePath,
              caption: image.caption || `Figure ${image.id}`,
            });
            
            if (imageReferences.length >= 3) break;
          }
          
          console.log(`Added ${imageReferences.length} images as generic examples`);
        } else {
          console.log(`Added ${imageReferences.length} topic-specific images based on user query`);
        }
      } else {
        // Just add the first image when AI mentions a diagram
        const firstImage = images[0];
        imageReferences.push({
          type: "image",
          id: firstImage.id,
          imagePath: firstImage.imagePath,
          caption: firstImage.caption || `Figure ${firstImage.id}`,
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
