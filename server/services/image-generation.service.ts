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
    
    // Generate a text-based mermaid diagram that browsers can render
    console.log('Generating mermaid diagram instead of DALL-E image (API access issues)');
    
    // Use OpenAI to generate a mermaid diagram
    const mermaidPrompt = `Create a mermaid.js diagram code for: ${enhancedPrompt}
The diagram should be a flowchart (use flowchart TD syntax). Keep it simple and focused on the main steps.
For example, if it's about OS migration steps, show the main 5-7 steps in the process.
Only generate valid mermaid.js code wrapped in a code block, nothing else. Use RiverMeadow terminology.`;

    const diagramResponse = await openai.chat.completions.create({
      model: "gpt-4o", // Use gpt-4o instead of DALL-E
      messages: [
        {role: "system", content: "You are a diagram creation assistant that generates only mermaid.js code. Respond with valid mermaid.js code only, no explanations."},
        {role: "user", content: mermaidPrompt}
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });
    
    // Extract the mermaid code from the response
    const messageContent = diagramResponse.choices[0].message.content || "";
    const mermaidCode = messageContent.trim();
    let cleanMermaidCode = mermaidCode
      .replace(/```mermaid/g, '')
      .replace(/```/g, '')
      .trim();
    
    // Validate and ensure the mermaid code has proper syntax
    if (!cleanMermaidCode.startsWith('graph') && !cleanMermaidCode.startsWith('flowchart')) {
      console.log('Adding flowchart TD prefix to mermaid code');
      cleanMermaidCode = 'flowchart TD\n' + cleanMermaidCode;
    }
    
    // Add a simple default diagram as fallback in case of empty or invalid diagram
    if (cleanMermaidCode.length < 10) {
      console.log('Generated mermaid code too short, using fallback diagram');
      cleanMermaidCode = `flowchart TD
    A[RiverMeadow Migration Start] --> B[Deploy Migration Appliance]
    B --> C[Configure Source and Target]
    C --> D[Perform Preflight Checks]
    D --> E[Execute Migration]
    E --> F[Verify Results]
    F --> G[Migration Complete]`;
    }
    
    // Create an HTML file with the mermaid diagram
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RiverMeadow Diagram</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'neutral',
      flowchart: { 
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
        padding: 10
      },
      fontSize: 14
    });
    
    // Make diagram fit better in iframe when embedded
    window.addEventListener('message', function(event) {
      if (event.data === 'resize') {
        // Get diagram element
        const diagram = document.querySelector('.mermaid');
        if (diagram) {
          setTimeout(() => {
            const event = new Event('resize');
            window.dispatchEvent(event);
          }, 100);
        }
      }
    });
    
    // Notify parent when loaded
    window.addEventListener('load', function() {
      if (window.parent) {
        window.parent.postMessage('diagramLoaded', '*');
      }
    });
  </script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 10px;
      background: #f5f5f5;
    }
    .diagram-container {
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      box-sizing: border-box;
    }
    .mermaid {
      text-align: center;
      font-size: 14px;
      max-width: 100%;
    }
    h1 {
      text-align: center;
      color: #0078d4;
      margin: 0 0 15px 0;
      font-size: 1.5rem;
    }
    
    /* Scale diagram to fit viewport */
    @media (max-width: 600px) {
      .diagram-container {
        padding: 10px;
      }
      h1 {
        font-size: 1.2rem;
      }
      .mermaid {
        zoom: 0.9;
      }
    }
  </style>
</head>
<body>
  <div class="diagram-container">
    <h1>RiverMeadow Migration Diagram</h1>
    <div class="mermaid">
${cleanMermaidCode}
    </div>
  </div>
</body>
</html>`;

    // Create timestamp & unique filename
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    const filename = `generated_diagram_${timestamp}_${uuid}.html`;
    const imagePath = path.join(GENERATED_IMAGES_DIR, filename);
    
    // Save HTML file to disk
    await writeFile(imagePath, htmlContent);
    
    console.log(`Successfully generated and saved mermaid diagram: ${filename}`);
    
    return {
      imagePath: `/uploads/generated/${filename}`,
      altText: prompt.substring(0, 255) // Limit alt text length
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
  
  // Check for commands that explicitly ask for OS migration diagrams/visuals
  if (
    lowercasePrompt.includes('os migration') ||
    lowercasePrompt.includes('rivermeadow') ||
    (lowercasePrompt.includes('migration') && lowercasePrompt.includes('diagram'))
  ) {
    console.log('OS Migration or RiverMeadow diagram request detected');
    return true;
  }
  
  // Simple detection for common phrases for broad matching
  if (
    lowercasePrompt.includes('diagram') || 
    lowercasePrompt.includes('create diagram') || 
    lowercasePrompt.includes('draw') || 
    lowercasePrompt.includes('chart') || 
    lowercasePrompt.includes('graph') || 
    lowercasePrompt.includes('visual') || 
    lowercasePrompt.includes('visualization') || 
    lowercasePrompt.includes('illustration') ||
    lowercasePrompt.includes('picture') ||
    lowercasePrompt.includes('image') ||
    lowercasePrompt.includes('generate') && (
      lowercasePrompt.includes('diagram') || 
      lowercasePrompt.includes('visual') || 
      lowercasePrompt.includes('illustration')
    )
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
    /(?:system|network|component|architectural)\s+(?:diagram|layout|topology)/i,
    
    // OS Migration specific patterns
    /generate\s+(?:.*?)\s*(?:based on|using|for|about)\s+(?:.*?)\s*(?:rivermeadow|migration)/i,
    /(?:OS|operating system)\s+migration/i
  ];

  const regexMatch = imageRequestPatterns.some(pattern => pattern.test(prompt));
  if (regexMatch) {
    console.log('Image generation request detected via regex pattern matching');
  }
  
  return regexMatch;
};