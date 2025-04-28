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
    
    // Determine if we need a network diagram instead of a flowchart
    const isNetworkDiagram = detectNetworkDiagramRequest(prompt);
    
    // Use OpenAI to generate a mermaid diagram
    let mermaidPrompt;
    
    if (isNetworkDiagram) {
      mermaidPrompt = `Create a mermaid.js network diagram code for: ${enhancedPrompt}
Use the appropriate syntax for network diagrams. In Mermaid, you can represent networks using:
1. flowchart LR - for left-to-right network diagrams
2. Use different node shapes to represent network components:
   - ((Database)) for databases
   - [Server] for servers
   - {{Firewall}} for firewalls
   - (Router) for routers
   - [/Load Balancer/] for load balancers
   - [(Storage)] for storage
   - [Cloud] for cloud services

Keep the diagram focused on the key network components and their connections.
Only generate valid mermaid.js code wrapped in a code block, nothing else. Use proper RiverMeadow terminology.`;
    } else {
      mermaidPrompt = `Create a mermaid.js diagram code for: ${enhancedPrompt}
The diagram should be a flowchart (use flowchart TD syntax). Keep it simple and focused on the main steps.
For example, if it's about OS migration steps, show the main 5-7 steps in the process.
Only generate valid mermaid.js code wrapped in a code block, nothing else. Use RiverMeadow terminology.`;
    }

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
      
      if (isNetworkDiagram) {
        // Network diagram fallback
        cleanMermaidCode = `flowchart LR
    Internet((Internet)) --> FW{{Firewall}}
    FW --> LB[/Load Balancer/]
    LB --> S1[Source Server 1]
    LB --> S2[Source Server 2]
    S1 --> RMS[RiverMeadow Server]
    S2 --> RMS
    RMS --> DB[(Database)]
    RMS --> Cloud1[Cloud Provider 1]
    RMS --> Cloud2[Cloud Provider 2]
    
    classDef network fill:#e3f2fd,stroke:#2196f3,stroke-width:1px;
    classDef source fill:#e8f5e9,stroke:#43a047,stroke-width:1px;
    classDef target fill:#fff3e0,stroke:#ff9800,stroke-width:1px;
    
    class Internet,FW,LB network
    class S1,S2 source
    class Cloud1,Cloud2 target`;
      } else {
        // Process diagram fallback
        cleanMermaidCode = `flowchart TD
    A[RiverMeadow Migration Start] --> B[Deploy Migration Appliance]
    B --> C[Configure Source and Target]
    C --> D[Perform Preflight Checks]
    D --> E[Execute Migration]
    E --> F[Verify Results]
    F --> G[Migration Complete]`;
      }
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
      flowchart: { useMaxWidth: true },
      securityLevel: 'loose' // This allows for downloading the SVG properly
    });
    
    // Notify parent when loaded
    window.addEventListener('load', function() {
      if (window.parent) {
        window.parent.postMessage('diagramLoaded', '*');
      }
    });
    
    // Make diagram fit better in iframe when embedded
    window.addEventListener('message', function(event) {
      // Handle zoom-in, zoom-out, and reset messages from parent
      if (event.data && typeof event.data === 'object') {
        if (event.data.action === 'zoom') {
          const diagram = document.querySelector('.diagram-container');
          if (diagram) {
            // Apply zoom to the actual diagram
            const mermaidDiv = document.querySelector('.mermaid svg');
            if (mermaidDiv) {
              // Apply zoom to the SVG element
              mermaidDiv.style.transform = 'scale(' + event.data.scale + ')';
              mermaidDiv.style.transformOrigin = '50% 0';
              mermaidDiv.style.transition = 'transform 0.2s ease';
            }
          }
        }
      }
    });
  </script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .diagram-container {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
      max-width: 1000px;
      margin: 0 auto;
      overflow: hidden;
    }
    .mermaid {
      text-align: center;
      width: 100%;
      overflow: auto;
    }
    .mermaid svg {
      max-width: 100%;
      height: auto !important;
    }
    h1 {
      text-align: center;
      color: #0078d4;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="diagram-container">
    <h1>${isNetworkDiagram ? 'RiverMeadow Network Architecture' : 'RiverMeadow Migration Diagram'}</h1>
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
 * Detect if the user is requesting a network diagram specifically
 */
function detectNetworkDiagramRequest(prompt: string): boolean {
  // Convert to lowercase for case-insensitive matching
  const lowercasePrompt = prompt.toLowerCase();
  
  // Keywords that indicate a network diagram request
  const networkKeywords = [
    'network diagram',
    'network architecture',
    'network topology',
    'system architecture',
    'infrastructure diagram',
    'cloud architecture',
    'cloud infrastructure',
    'connectivity diagram',
    'network design',
    'infrastructure architecture',
    'deployment architecture',
    'communication architecture',
    'system topology'
  ];
  
  // Check if any network keywords are in the prompt
  const hasNetworkKeyword = networkKeywords.some(keyword => 
    lowercasePrompt.includes(keyword)
  );
  
  // Additional check for common network-related terms combined with diagram requests
  const hasNetworkContext = 
    (lowercasePrompt.includes('network') || 
     lowercasePrompt.includes('infrastructure') || 
     lowercasePrompt.includes('cloud') || 
     lowercasePrompt.includes('server') || 
     lowercasePrompt.includes('router') || 
     lowercasePrompt.includes('firewall') ||
     lowercasePrompt.includes('architecture')) && 
    (lowercasePrompt.includes('diagram') || 
     lowercasePrompt.includes('map') || 
     lowercasePrompt.includes('topology') ||
     lowercasePrompt.includes('layout'));
  
  if (hasNetworkKeyword || hasNetworkContext) {
    console.log('Network diagram request detected');
    return true;
  }
  
  return false;
}

/**
 * Check if a prompt is asking for an image or diagram
 */
export const isImageGenerationRequest = (prompt: string): boolean => {
  // Convert to lowercase for case-insensitive matching
  const lowercasePrompt = prompt.toLowerCase();
  
  // First, check if this is a question - if it starts with what, how, why, when, etc.
  // If so, we DON'T want to generate a diagram for it unless it explicitly asks
  const isQuestion = /^(?:what|how|why|when|where|who|can|is|are|do|does|which|could|would|should|will)\b/i.test(lowercasePrompt);
  
  // ONLY if this is a question, let's check if it EXPLICITLY asks for a diagram
  if (isQuestion) {
    // If it's a question, it should explicitly ask for a visual
    const explicitlyAsksForDiagram = 
      /(?:show|create|draw|generate|make|give)\s+(?:me|us|a|an)?\s*(?:diagram|chart|visual|graph|picture)/i.test(lowercasePrompt) ||
      /(?:can|could)\s+(?:you|i)\s+(?:show|see|have|get)\s+(?:a|an)?\s*(?:diagram|visual|chart|graph)/i.test(lowercasePrompt) ||
      /(?:i|we)\s+(?:want|need|would like)\s+(?:a|an|to see)?\s*(?:diagram|chart|visual|graph)/i.test(lowercasePrompt);
      
    if (!explicitlyAsksForDiagram) {
      console.log('Question detected but does not explicitly ask for a diagram');
      return false;
    }
  }
  
  // Check for commands that explicitly ask for OS migration diagrams/visuals
  if (
    (lowercasePrompt.includes('os migration') && lowercasePrompt.includes('diagram')) ||
    (lowercasePrompt.includes('rivermeadow') && lowercasePrompt.includes('diagram')) ||
    (lowercasePrompt.includes('migration') && lowercasePrompt.includes('diagram'))
  ) {
    console.log('OS Migration or RiverMeadow diagram request detected');
    return true;
  }
  
  // More focused detection for direct diagram requests (must contain diagram-specific words)
  const containsDiagramWords = 
    lowercasePrompt.includes('diagram') || 
    lowercasePrompt.includes('chart') || 
    lowercasePrompt.includes('graph') ||
    lowercasePrompt.includes('visualization') ||
    lowercasePrompt.includes('flowchart') ||
    lowercasePrompt.includes('architecture');
  
  if (!containsDiagramWords) {
    return false;
  }
  
  // Additional check for action verbs specific to creating visuals
  const containsActionVerbs =
    lowercasePrompt.includes('create') ||
    lowercasePrompt.includes('draw') ||
    lowercasePrompt.includes('show') ||
    lowercasePrompt.includes('generate') ||
    lowercasePrompt.includes('visualize') ||
    lowercasePrompt.includes('make') ||
    lowercasePrompt.includes('design');
    
  if (containsActionVerbs && containsDiagramWords) {
    console.log('Direct diagram request detected via keyword matching');
    return true;
  }
  
  // More specific regex patterns for clear diagram requests
  const imageRequestPatterns = [
    // Direct requests for diagrams with clear intent
    /create\s+(?:a|an)?\s*(?:diagram|chart|graph|visualization)/i,
    /generate\s+(?:a|an)?\s*(?:diagram|chart|graph|visualization)/i,
    /draw\s+(?:a|an)?\s*(?:diagram|chart|graph|visualization)/i,
    /show\s+(?:a|an|me|us)?\s*(?:diagram|chart|graph|visualization)/i,
    
    // Explicit architectural diagram requests
    /(?:system|network|component|architectural)\s+diagram/i,
    /(?:flow|process|architecture|system|component)\s+diagram/i,
    
    // Network diagram specific
    /network\s+(?:diagram|architecture|topology)/i,
    /infrastructure\s+(?:diagram|architecture|map)/i,
    
    // Very specific rivermeadow diagram requests
    /(?:rivermeadow|migration)\s+(?:diagram|architecture|flow|process)/i
  ];

  const regexMatch = imageRequestPatterns.some(pattern => pattern.test(prompt));
  if (regexMatch) {
    console.log('Image generation request detected via specific pattern matching');
    return true;
  }
  
  console.log('No clear diagram request detected');
  return false;
};