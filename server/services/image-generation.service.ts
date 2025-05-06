// Basic imports
import { writeFile, mkdir } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Define the directories for storing images
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const GENERATED_IMAGES_DIR = path.join(UPLOADS_DIR, 'generated');
const PNG_DIR = path.join(UPLOADS_DIR, 'png');

// Create necessary directories for storing images
const ensureDirectoriesExist = async () => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR);
    }
    if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
      await mkdir(GENERATED_IMAGES_DIR);
    }
    if (!fs.existsSync(PNG_DIR)) {
      await mkdir(PNG_DIR);
    }
  } catch (error) {
    console.error('Error creating directories:', error);
  }
};

// Simple diagram generation function
const generateDiagram = async (
  prompt: string,
  knowledgeContext: string[] = [],
  useDrawIO: boolean = true
): Promise<{
  imagePath: string;
  mmdPath: string;
  mmdFilename: string;
  altText: string;
}> => {
  try {
    // Make sure necessary directories exist
    await ensureDirectoriesExist();
    
    // Generate a unique filename
    const timestamp = Date.now();
    const uniqueId = `${timestamp}-${Math.random().toString(36).substring(2, 8)}`;
    const mmdFilename = `diagram_${uniqueId}.drawio`;
    
    // Create a simple HTML file with DrawIO diagram
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>RiverMeadow Diagram</title>
        <meta charset="utf-8">
      </head>
      <body>
        <div>
          <h1>Diagram for: ${prompt}</h1>
          <p>Generated diagram based on your prompt.</p>
          <div class="diagram">
            <!-- Placeholder for diagram content -->
            <pre>Generated diagram: ${prompt}</pre>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const htmlFilename = `diagram_${uniqueId}.html`;
    const htmlPath = path.join(GENERATED_IMAGES_DIR, htmlFilename);
    await writeFile(htmlPath, htmlContent);
    
    // Also save as DrawIO file
    const drawioPath = path.join(GENERATED_IMAGES_DIR, mmdFilename);
    await writeFile(drawioPath, `<mxfile><diagram id="diagram" name="RiverMeadow Diagram">
      <mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="${prompt}" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
        <mxGeometry x="350" y="190" width="120" height="60" as="geometry"/>
      </mxCell></root></mxGraphModel></diagram></mxfile>`);
    
    return {
      imagePath: `/uploads/generated/${htmlFilename}`,
      mmdPath: `/uploads/generated/${mmdFilename}`,
      mmdFilename,
      altText: prompt.substring(0, 255) // Limit alt text length
    };
  } catch (error) {
    console.error('Error generating diagram:', error);
    throw new Error('Failed to generate diagram');
  }
};

// This is a utility function to determine if we should generate a diagram for a given prompt
const isImageGenerationRequest = (prompt: string): boolean => {
  const lowercasePrompt = prompt.toLowerCase();
  
  return lowercasePrompt.includes('diagram') || 
         lowercasePrompt.includes('chart') || 
         lowercasePrompt.includes('visual') ||
         lowercasePrompt.includes('image') ||
         lowercasePrompt.includes('picture');
};

// Export necessary functions
export {
  generateDiagram,
  ensureDirectoriesExist,
  isImageGenerationRequest
};