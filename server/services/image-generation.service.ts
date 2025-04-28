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
    
    // Generate a text-based d2 diagram that browsers can render
    console.log('Generating d2 diagram instead of DALL-E image');
    
    // Determine if we need a network diagram instead of a flowchart
    const isNetworkDiagram = detectNetworkDiagramRequest(prompt);
    console.log(`Diagram type: ${isNetworkDiagram ? 'Network diagram' : 'Standard diagram'}`);
    
    // Use OpenAI to generate a d2 diagram
    let d2Prompt;
    
    if (isNetworkDiagram) {
      d2Prompt = `Create a d2 diagram code for: ${enhancedPrompt}
Use the appropriate syntax for network diagrams in d2. In d2, you can represent networks using boxes, shapes, and connections with arrows.
Consider these examples for network components:
- databases using shape: cylinder
- servers using shape: rectangle
- firewalls using style.fill: "#f8d7da"
- routers with style.stroke-dash: 3
- load balancers using shape: oval
- storage elements with shape: storage

Networks can be arranged with "direction: right" for horizontal layouts.
Connection syntax uses arrows: server -> router -> internet

Keep the diagram focused on the key network components and their connections.
Only generate valid d2 syntax, nothing else. Use proper RiverMeadow terminology.`;
    } else {
      d2Prompt = `Create a d2 diagram code for: ${enhancedPrompt}
The diagram should be a flowchart. Keep it simple and focused on the main steps.
For example, if it's about OS migration steps, show the main 5-7 steps in the process.
Use "direction: down" for vertical flow.
Connect elements with arrows: step1 -> step2 -> step3
Add colors with style.fill: "#e6f7ff" and style.stroke: "#1890ff"
Only generate valid d2 syntax, nothing else. Use RiverMeadow terminology.`;
    }

    const diagramResponse = await openai.chat.completions.create({
      model: "gpt-4o", // Use GPT-4o for diagram generation
      messages: [
        {role: "system", content: "You are a diagram creation assistant that generates only d2 diagram code. Respond with valid d2 code only, no explanations. D2 is a modern diagram language that uses a simple syntax."},
        {role: "user", content: d2Prompt}
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });
    
    // Extract the d2 code from the response
    const messageContent = diagramResponse.choices[0].message.content || "";
    const d2Code = messageContent.trim();
    let cleanD2Code = d2Code
      .replace(/```d2/g, '')
      .replace(/```/g, '')
      .trim();
    
    // Add a simple default diagram as fallback in case of empty or invalid diagram
    if (cleanD2Code.length < 10) {
      console.log('Generated d2 code too short, using fallback diagram');
      
      if (isNetworkDiagram) {
        // Network diagram fallback
        cleanD2Code = `direction: right
Internet: {
  shape: cloud
  style.fill: "#e3f2fd"
}
Firewall: {
  shape: rectangle
  style.fill: "#ffcdd2"
  style.stroke: "#f44336"
}
LoadBalancer: {
  shape: oval
  label: "Load Balancer"
  style.fill: "#e1f5fe"
}
SourceServer1: {
  shape: rectangle
  label: "Source Server 1"
  style.fill: "#e8f5e9"
}
SourceServer2: {
  shape: rectangle
  label: "Source Server 2"
  style.fill: "#e8f5e9"
}
RiverMeadow: {
  shape: rectangle
  label: "RiverMeadow Server"
  style.fill: "#fff9c4"
}
Database: {
  shape: cylinder
  style.fill: "#f3e5f5"
}
Cloud1: {
  shape: cloud
  label: "Cloud Provider 1"
  style.fill: "#e3f2fd"
}
Cloud2: {
  shape: cloud
  label: "Cloud Provider 2"
  style.fill: "#e3f2fd"
}

Internet -> Firewall -> LoadBalancer
LoadBalancer -> SourceServer1
LoadBalancer -> SourceServer2
SourceServer1 -> RiverMeadow
SourceServer2 -> RiverMeadow
RiverMeadow -> Database
RiverMeadow -> Cloud1
RiverMeadow -> Cloud2`;
      } else {
        // Process diagram fallback
        cleanD2Code = `direction: down
Start: {
  label: "RiverMeadow Migration Start"
  style.fill: "#e3f2fd"
}
DeployAppliance: {
  label: "Deploy Migration Appliance"
  style.fill: "#e8f5e9"
}
Configure: {
  label: "Configure Source and Target"
  style.fill: "#e8f5e9"
}
PreflightChecks: {
  label: "Perform Preflight Checks"
  style.fill: "#fff9c4"
}
ExecuteMigration: {
  label: "Execute Migration"
  style.fill: "#fff9c4"
}
VerifyResults: {
  label: "Verify Results"
  style.fill: "#fff9c4"
}
Complete: {
  label: "Migration Complete"
  style.fill: "#e3f2fd"
}

Start -> DeployAppliance -> Configure -> PreflightChecks -> ExecuteMigration -> VerifyResults -> Complete`;
      }
    }
    
    // Create an HTML file with the d2 diagram using the web renderer
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RiverMeadow Diagram</title>
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <script src="https://unpkg.com/@d2lang/d2@latest/dist/d2.js"></script>
  <script>
    // Setup d2 diagram configuration 
    const config = {
      theme: 'default',
      darkMode: false,
      pad: 20,
      layout: {
        rankDir: '${isNetworkDiagram ? 'LR' : 'TB'}',
        nodesep: 70,
        ranksep: 70, 
      }
    };
    
    // Store the diagram code
    const d2Code = \`${cleanD2Code.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\`;
    
    // Notify parent when loaded
    window.addEventListener('load', function() {
      if (window.parent) {
        window.parent.postMessage('diagramLoaded', '*');
      }
      
      // Render the D2 diagram once loaded
      renderD2Diagram();
    });
    
    // Function to render D2 diagram
    function renderD2Diagram() {
      try {
        const container = document.getElementById('diagram-container');
        
        // Wait a moment to make sure all dependencies are loaded
        setTimeout(() => {
          try {
            // Fallback to displaying the code in case the d2 library isn't available
            if (typeof d2 === 'undefined' || !d2.Diagram) {
              container.innerHTML = '<div class="fallback-message">Interactive diagram rendering is unavailable, showing the diagram code below:</div><pre>' + d2Code + '</pre>';
              return;
            }
            
            // Create a new diagram instance
            const diagram = new d2.Diagram(d2Code);
            
            // Render as SVG
            diagram.render('svg')
              .then(svg => {
                // Insert the generated SVG into the container
                container.innerHTML = '';
                container.appendChild(svg);
                
                // Set SVG attributes for better display
                if (svg) {
                  svg.setAttribute('width', '100%');
                  svg.setAttribute('height', 'auto');
                  svg.style.maxWidth = '100%';
                }
                
                // Notify parent that diagram is fully rendered
                if (window.parent) {
                  window.parent.postMessage('diagramRendered', '*');
                }
              })
              .catch(error => {
                console.error('Error rendering D2 diagram:', error);
                // Fallback to displaying the code if rendering fails
                container.innerHTML = '<div class="error">Error rendering diagram</div><pre>' + d2Code + '</pre>';
              });
          } catch (error) {
            console.error('Error in D2 rendering process:', error);
            container.innerHTML = '<div class="error">Error in diagram rendering process</div><pre>' + d2Code + '</pre>';
          }
        }, 1000); // Longer timeout to ensure library loads
      } catch (error) {
        console.error('Error initializing D2 diagram:', error);
        document.getElementById('diagram-container').innerHTML = '<div class="error">Error initializing diagram</div><pre>' + d2Code + '</pre>';
      }
    }
    
    // Make diagram fit better in iframe when embedded
    window.addEventListener('message', function(event) {
      // Handle zoom-in, zoom-out, and reset messages from parent
      if (event.data && typeof event.data === 'object') {
        if (event.data.action === 'zoom') {
          const diagram = document.querySelector('#diagram-container');
          if (diagram) {
            // Apply zoom to the SVG element
            const svgElement = diagram.querySelector('svg');
            if (svgElement) {
              svgElement.style.transform = 'scale(' + event.data.scale + ')';
              svgElement.style.transformOrigin = '50% 0';
              svgElement.style.transition = 'transform 0.2s ease';
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
    #diagram-container {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
      max-width: 1000px;
      margin: 0 auto;
      overflow: hidden;
      min-height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      max-width: 100%;
      height: auto !important;
    }
    h1 {
      text-align: center;
      color: #0078d4;
      margin-bottom: 20px;
    }
    .error {
      color: #d32f2f;
      padding: 15px;
      text-align: center;
      font-weight: bold;
    }
    pre {
      white-space: pre-wrap;
      font-size: 12px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 4px;
      overflow: auto;
    }
  </style>
</head>
<body>
  <h1>${isNetworkDiagram ? 'RiverMeadow Network Architecture' : 'RiverMeadow Migration Diagram'}</h1>
  <div id="diagram-container">
    <div style="text-align: center;">Loading diagram...</div>
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