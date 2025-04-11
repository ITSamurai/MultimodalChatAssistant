import { writeFile, mkdir } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from "openai";

// Initialize OpenAI client directly
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Define the directories for storing images
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const GENERATED_IMAGES_DIR = path.join(UPLOADS_DIR, 'generated');

/**
 * Create necessary directories for storing images
 */
const ensureDirectoriesExist = async () => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
      await mkdir(GENERATED_IMAGES_DIR, { recursive: true });
    }
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error('Error creating directories:', error);
    throw new Error(`Failed to create directories: ${error.message}`);
  }
};

/**
 * Generate a diagram image using DALL-E based on a text prompt
 */
export const generateDiagram = async (
  prompt: string, 
  context?: string
): Promise<{ imagePath: string, altText: string }> => {
  try {
    console.log('Starting diagram generation process');
    await ensureDirectoriesExist();
    console.log('Directories for image storage confirmed');
    
    // Enhance the prompt with context if provided, but limit the context length
    let enhancedPrompt = prompt;
    if (context) {
      console.log('Context provided for diagram generation, length:', context.length);
      // Limit context to about 1000 characters to avoid exceeding DALL-E's limit
      const limitedContext = context.length > 1000 
        ? context.substring(0, 1000) + "..." 
        : context;
      
      enhancedPrompt = `Create a clear technical diagram based on this information: ${limitedContext}\n\nSpecifically showing: ${prompt}\n\nMake it a simple, clean, professional diagram with clear labels.`;
    } else {
      console.log('No context provided for diagram generation');
      enhancedPrompt = `Create a clear technical diagram showing: ${prompt}\n\nMake it a simple, clean, professional diagram with clear labels.`;
    }
    
    // Ensure the prompt doesn't exceed DALL-E's 4000 character limit
    const originalLength = enhancedPrompt.length;
    if (enhancedPrompt.length > 3800) {
      enhancedPrompt = enhancedPrompt.substring(0, 3800) + "...";
      console.log(`Prompt truncated from ${originalLength} to ${enhancedPrompt.length} characters`);
    }
    
    console.log(`Generating diagram with prompt: ${enhancedPrompt.substring(0, 100)}...`);
    console.log('Final prompt length:', enhancedPrompt.length);
    
    // Call DALL-E API to generate the image
    console.log('Calling OpenAI image generation API...');
    let response;
    try {
      // Try DALL-E 2 which has broader access
      response = await openai.images.generate({
        // DALL-E 2 is the default model, no need to specify
        prompt: enhancedPrompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json"
      });
      console.log('Successfully called DALL-E image generation');
    } catch (error) {
      console.error('Error with DALL-E image generation:', error);
      throw error; // Re-throw to be caught by the outer catch
    }
    
    if (!response || !response.data || response.data.length === 0 || !response.data[0].b64_json) {
      throw new Error('Failed to generate image: Empty response from DALL-E');
    }
    
    // Get image data and info
    const imageData = response.data[0].b64_json;
    const revised_prompt = response.data[0].revised_prompt || enhancedPrompt;
    
    // Create unique filename
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    const filename = `generated_diagram_${timestamp}_${uuid}.png`;
    const imagePath = path.join(GENERATED_IMAGES_DIR, filename);
    
    // Save image to disk
    const buffer = Buffer.from(imageData, 'base64');
    await writeFile(imagePath, buffer);
    
    console.log(`Successfully generated and saved diagram: ${filename}`);
    
    return {
      imagePath: `/uploads/generated/${filename}`,
      altText: revised_prompt.substring(0, 255) // Limit alt text length
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error('Error generating diagram:', error);
    throw new Error(`Failed to generate diagram: ${error.message}`);
  }
};

/**
 * Check if a prompt is asking for an image or diagram
 */
export const isImageGenerationRequest = (prompt: string): boolean => {
  // Convert to lowercase for case-insensitive matching
  const lowercasePrompt = prompt.toLowerCase();
  
  // Simple detection for common phrases for broad matching
  if (
    lowercasePrompt.includes('diagram') || 
    lowercasePrompt.includes('create diagram') || 
    lowercasePrompt.includes('draw') || 
    lowercasePrompt.includes('chart') || 
    lowercasePrompt.includes('graph') || 
    lowercasePrompt.includes('visual') || 
    lowercasePrompt.includes('illustration') ||
    lowercasePrompt.includes('picture') ||
    lowercasePrompt.includes('image')
  ) {
    console.log('Image generation request detected via simple keyword matching');
    return true;
  }
  
  // More specific regex patterns as fallback
  const imageRequestPatterns = [
    // Direct requests for diagrams
    /create\s+(?:a|an)?\s*(?:diagram|chart|graph|visualization|figure|illustration)/i,
    /generate\s+(?:a|an)?\s*(?:diagram|chart|graph|visualization|figure|illustration)/i,
    /draw\s+(?:a|an)?\s*(?:diagram|chart|graph|visualization|figure|illustration)/i,
    /show\s+(?:a|an|me|us)?\s*(?:diagram|chart|graph|visualization|figure|illustration)/i,
    /visualize/i,
    /illustrate/i,
    
    // More generic visual requests with diagram-related context
    /(?:diagram|chart|graph)(?:\s+showing|\s+of|\s+for)?/i,
    /visual representation/i,
    /(?:flow|process|architecture|system|component)\s+diagram/i,
    /(?:workflow|process|sequence|data)\s+(?:chart|flow)/i,
    
    // Visual requests with architecture terminology
    /(?:system|network|component|architectural)\s+(?:diagram|layout|topology)/i
  ];

  const regexMatch = imageRequestPatterns.some(pattern => pattern.test(prompt));
  if (regexMatch) {
    console.log('Image generation request detected via regex pattern matching');
  }
  
  return regexMatch;
};