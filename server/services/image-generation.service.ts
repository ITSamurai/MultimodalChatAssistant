import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

// Initialize OpenAI client
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Promisify fs functions
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);

// Base directory for storing generated images
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const GENERATED_IMAGES_DIR = path.join(UPLOADS_DIR, 'generated');

// Ensure upload and generated images directories exist
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
    await ensureDirectoriesExist();
    
    // Enhance the prompt with context if provided
    let enhancedPrompt = prompt;
    if (context) {
      enhancedPrompt = `Create a clear technical diagram based on this information: ${context}\n\nSpecifically showing: ${prompt}\n\nMake it a simple, clean, professional diagram with clear labels.`;
    } else {
      enhancedPrompt = `Create a clear technical diagram showing: ${prompt}\n\nMake it a simple, clean, professional diagram with clear labels.`;
    }
    
    console.log(`Generating diagram with prompt: ${enhancedPrompt.substring(0, 100)}...`);
    
    // Call DALL-E API to generate the image
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json"
    });
    
    if (!response.data || response.data.length === 0 || !response.data[0].b64_json) {
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
  const imageRequestPatterns = [
    // Direct requests for diagrams
    /create\s+(?:a|an)\s+(?:diagram|chart|graph|visualization|figure|illustration)/i,
    /generate\s+(?:a|an)\s+(?:diagram|chart|graph|visualization|figure|illustration)/i,
    /draw\s+(?:a|an)\s+(?:diagram|chart|graph|visualization|figure|illustration)/i,
    /show\s+(?:a|an|me|us)\s+(?:diagram|chart|graph|visualization|figure|illustration)/i,
    /visualize/i,
    /illustrate/i,
    
    // More generic visual requests with diagram-related context
    /(?:diagram|chart|graph) showing/i,
    /visual representation/i,
    /(?:flow|process|architecture|system|component)\s+diagram/i,
    /(?:workflow|process|sequence|data)\s+(?:chart|flow)/i,
    
    // Visual requests with architecture terminology
    /(?:system|network|component|architectural)\s+(?:diagram|layout|topology)/i
  ];

  return imageRequestPatterns.some(pattern => pattern.test(prompt));
};