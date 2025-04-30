import { writeFile, mkdir } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from "openai";
import { storage } from '../storage';

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
/**
 * Generate a Draw.IO compatible diagram XML
 */
async function generateDrawIODiagram(
  prompt: string,
  enhancedPrompt: string,
  isNetworkDiagram: boolean
): Promise<string> {
  try {
    // Get configuration
    const config = await storage.getConfig();
    const drawioTheme = config?.drawio_theme || 'default';
    
    // Prompt for Draw.IO diagram - requesting only the CELLS not the full XML
    const drawioPrompt = isNetworkDiagram 
      ? `Create cell elements for a Draw.IO (diagrams.net) diagram that shows a network diagram for: ${enhancedPrompt}
         Include proper network components like routers, firewalls, servers, load balancers, and cloud services.
         IMPORTANT: Do NOT include <mxfile>, <diagram>, <mxGraphModel>, or <root> tags. ONLY return the individual <mxCell> elements.
         The diagram should use the ${drawioTheme} theme style and be properly connected with edges.`
      : `Create cell elements for a Draw.IO (diagrams.net) diagram that shows a flowchart for: ${enhancedPrompt}
         IMPORTANT: Do NOT include <mxfile>, <diagram>, <mxGraphModel>, or <root> tags. ONLY return the individual <mxCell> elements.
         The diagram should be clean, professional, use the ${drawioTheme} theme style, and have proper flow connections.`;
         
    // Use OpenAI to generate Draw.IO XML
    const diagramResponse = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
        {role: "system", content: "You are a diagram creation assistant that generates Draw.IO (diagrams.net) XML cell elements. Respond ONLY with <mxCell> elements without any outer container tags like <mxfile>, <diagram>, <mxGraphModel>, or <root>. Do not include markdown formatting or explanations."},
        {role: "user", content: drawioPrompt}
      ],
      max_tokens: 2500,
      temperature: 0.5,
    });
    
    // Extract the Draw.IO XML cells
    const messageContent = diagramResponse.choices[0].message.content || "";
    
    // Clean the XML (remove any markdown code block formatting)
    let cellsXml = messageContent.trim()
      .replace(/```xml/g, '')
      .replace(/```/g, '')
      .trim();
      
    // Remove any xml declarations if they exist
    cellsXml = cellsXml.replace(/<\?xml[^>]*\?>/g, '');
    
    // Remove any mxfile, diagram, mxGraphModel or root tags if they exist
    cellsXml = cellsXml
      .replace(/<\/?mxfile[^>]*>/g, '')
      .replace(/<\/?diagram[^>]*>/g, '')
      .replace(/<\/?mxGraphModel[^>]*>/g, '')
      .replace(/<\/?root[^>]*>/g, '')
      .trim();
    
    // Fix IDs to ensure uniqueness - replace any id="0" or id="1" with unique IDs
    // This prevents conflicts with the standard root cells
    const baseId = Date.now().toString().slice(-6); // Use timestamp as base for unique IDs
    
    // Replace ID attributes (both id="X" and parent="X") with unique values
    // Avoid replacing ID 0 and 1 in parent attributes first by temporarily marking them
    cellsXml = cellsXml
      .replace(/parent="0"/g, 'parent="ROOT_PLACEHOLDER"')
      .replace(/parent="1"/g, 'parent="CANVAS_PLACEHOLDER"');
      
    // Now replace all cell IDs to ensure uniqueness
    cellsXml = cellsXml
      .replace(/id="0"/g, `id="cell_${baseId}_0"`)
      .replace(/id="1"/g, `id="cell_${baseId}_1"`)
      .replace(/id="2"/g, `id="cell_${baseId}_2"`)
      .replace(/id="3"/g, `id="cell_${baseId}_3"`)
      .replace(/id="4"/g, `id="cell_${baseId}_4"`)
      .replace(/id="5"/g, `id="cell_${baseId}_5"`)
      .replace(/id="6"/g, `id="cell_${baseId}_6"`)
      .replace(/id="7"/g, `id="cell_${baseId}_7"`)
      .replace(/id="8"/g, `id="cell_${baseId}_8"`)
      .replace(/id="9"/g, `id="cell_${baseId}_9"`);
      
    // For IDs 10 and above, use a more general regex
    cellsXml = cellsXml.replace(/id="(\d+)"/g, (match, id) => {
      // Only replace IDs that are pure numbers and above 9
      if (!isNaN(id) && parseInt(id) > 9) {
        return `id="cell_${baseId}_${id}"`;
      }
      return match;
    });
    
    // Now update all parent references to match the new IDs
    cellsXml = cellsXml
      .replace(/parent="ROOT_PLACEHOLDER"/g, 'parent="0"') // Root cell reference
      .replace(/parent="CANVAS_PLACEHOLDER"/g, 'parent="1"') // Canvas cell reference
      .replace(/parent="2"/g, `parent="cell_${baseId}_2"`)
      .replace(/parent="3"/g, `parent="cell_${baseId}_3"`)
      .replace(/parent="4"/g, `parent="cell_${baseId}_4"`)
      .replace(/parent="5"/g, `parent="cell_${baseId}_5"`)
      .replace(/parent="6"/g, `parent="cell_${baseId}_6"`)
      .replace(/parent="7"/g, `parent="cell_${baseId}_7"`)
      .replace(/parent="8"/g, `parent="cell_${baseId}_8"`)
      .replace(/parent="9"/g, `parent="cell_${baseId}_9"`);
      
    // For parents 10 and above, use a general regex
    cellsXml = cellsXml.replace(/parent="(\d+)"/g, (match, id) => {
      // Only replace parents that are pure numbers and above 9
      if (!isNaN(id) && parseInt(id) > 9) {
        return `parent="cell_${baseId}_${id}"`;
      }
      return match;
    });
    
    // Force all remaining cells to be children of the canvas cell (id="1")
    // Replace any mxCell that doesn't have a parent attribute with parent="1"
    cellsXml = cellsXml.replace(/<mxCell\s+([^>]*?)\s*(?:\/?>|><\/mxCell>)/g, (match, attrs) => {
      if (!attrs.includes('parent=')) {
        return match.replace('<mxCell', '<mxCell parent="1"');
      }
      return match;
    });
    
    // Create proper Draw.IO XML structure with the cells
    // Add a unique diagram ID and ensure cells have proper parent references
    const diagramId = `diagram-${uuidv4()}`;
    const drawioXml = `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="RiverMeadow AI" version="21.3.7">
  <diagram id="${diagramId}" name="RiverMeadow Diagram">
    <mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        ${cellsXml}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
    
    return drawioXml;
  } catch (error) {
    console.error('Error generating Draw.IO diagram:', error);
    throw error;
  }
}

export const generateDiagram = async (
  prompt: string, 
  context?: string
): Promise<{ imagePath: string, mmdPath: string, mmdFilename: string, altText: string }> => {
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
    
    // Get configuration to determine which diagram engine to use
    const config = await storage.getConfig();
    const diagramEngine = config?.diagram_engine || 'drawio';
    
    // Check if we should use Draw.IO
    if (diagramEngine === 'drawio') {
      console.log('Using Draw.IO for diagram generation');
      
      try {
        // Generate Draw.IO diagram XML
        const drawioXml = await generateDrawIODiagram(prompt, enhancedPrompt, isNetworkDiagram);
        
        // Create timestamp & unique filename
        const timestamp = Date.now();
        const uuid = uuidv4().substring(0, 8);
        const baseFilename = `generated_diagram_${timestamp}_${uuid}`;
        const xmlFilename = `${baseFilename}.xml`;
        const htmlFilename = `${baseFilename}.html`;
        
        const xmlPath = path.join(GENERATED_IMAGES_DIR, xmlFilename);
        const htmlPath = path.join(GENERATED_IMAGES_DIR, htmlFilename);
        
        // Save the Draw.IO XML to a file
        await writeFile(xmlPath, drawioXml);
        
        // Create an HTML wrapper for the Draw.IO diagram that doesn't rely on external services
        const drawioHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RiverMeadow Diagram</title>
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
      max-width: 100%;
      margin: 0 auto;
      overflow: hidden;
      position: relative;
    }
    h1 {
      text-align: center;
      color: #0078d4;
      margin-bottom: 20px;
      font-size: 18px;
    }
    .diagram-view {
      padding: 10px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background: #fff;
      margin-bottom: 20px;
      overflow: auto;
      max-height: 600px;
    }
    .diagram-preview {
      width: 100%;
      height: 280px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background: #fafafa;
      margin: 15px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      text-align: center;
      overflow: hidden;
    }
    .diagram-preview h2 {
      margin-top: 0;
      margin-bottom: 15px;
      font-size: 16px;
      color: #444;
    }
    .diagram-preview-content {
      font-size: 13px;
      color: #666;
      margin: 0 20px;
    }
    .download-container {
      text-align: center;
      margin: 15px 0;
    }
    .download-button {
      background-color: #0078d4;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      text-decoration: none;
      display: inline-block;
    }
    .download-button:hover {
      background-color: #005a9e;
    }
    .api-download-button {
      background-color: #28a745;
      margin-left: 5px;
    }
    .api-download-button:hover {
      background-color: #218838;
    }
    .xml-display {
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 4px;
      overflow: auto;
      max-height: 300px;
      margin-top: 20px;
    }
    .note {
      font-size: 14px;
      color: #666;
      margin: 15px 0;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="diagram-container">
    <h1>${isNetworkDiagram ? 'RiverMeadow Network Architecture' : 'RiverMeadow Migration Diagram'}</h1>
    
    <div class="note">
      This diagram is in Draw.IO format. You can download it to edit in diagrams.net
    </div>
    
    <div class="diagram-preview">
      <h2>Diagram Preview</h2>
      <img src="/api/diagram-png/${xmlFilename}" alt="Diagram Preview" 
           style="max-width: 100%; max-height: 500px; border: 1px solid #ddd; border-radius: 4px; margin: 10px 0;" />
    </div>
    
    <div class="download-container">
      <a href="data:application/xml;charset=utf-8,${encodeURIComponent(drawioXml)}" 
         download="rivermeadow_diagram.drawio" 
         class="download-button">Download Draw.IO Diagram</a>
         
      <a href="/api/diagram-xml/${xmlFilename}" 
         class="download-button api-download-button">API Download</a>
    </div>
    
    <div class="note">
      After downloading, you can open this file at <a href="https://app.diagrams.net/" target="_blank">diagrams.net</a>
    </div>
    
    <details>
      <summary>View XML Content</summary>
      <div class="xml-display">${drawioXml.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </details>
  </div>
</body>
</html>`;

        // Save the HTML file
        await writeFile(htmlPath, drawioHtml);
        
        console.log(`Successfully generated Draw.IO diagram: ${xmlFilename} and HTML viewer: ${htmlFilename}`);
        
        // Return the paths
        return {
          imagePath: `/uploads/generated/${htmlFilename}`,
          mmdPath: `/uploads/generated/${xmlFilename}`,
          mmdFilename: xmlFilename,
          altText: prompt.substring(0, 255)
        };
      } catch (error) {
        console.error('Error generating Draw.IO diagram:', error);
        console.log('Falling back to mermaid diagram generation due to error');
        // Fall through to mermaid generation as a fallback
      }
    }
    
    // If we're here, use Mermaid for diagram generation
    console.log('Using Mermaid for diagram generation');
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
    
    // Check if this is an OS-based migration diagram request
    const isOsMigrationRequest = prompt.toLowerCase().includes('os') && 
                                (prompt.toLowerCase().includes('migration') || 
                                 prompt.toLowerCase().includes('migrate'));
                                 
    // Add a specific OS migration diagram or fallback diagram for empty/invalid code
    if (isOsMigrationRequest || prompt.toLowerCase().includes('os based migration')) {
      console.log('OS-based migration diagram request detected, using specific diagram');
      
      // Use a simpler version of the OS migration diagram that's guaranteed to render
      cleanMermaidCode = `graph TD
    A[Review OS-based Migration Requirements] --> B[Migration Setup]
    B --> C[Full Migration Profile Setup]
    B --> D[Differential Migration Profile Setup]
    C --> E[Source Server 1]
    C --> F[Source Server 2]
    D --> G[Source Server 1]
    D --> H[Source Server 2]
    E --> I[Target Setup]
    F --> J[Target Setup]
    G --> K[Target Setup]
    H --> L[Target Setup]
    I --> M[Migration Summary]
    J --> M
    K --> M
    L --> M
    M --> N[Deployment Plan]
    
    style A fill:#e3f2fd,stroke:#2196f3
    style B fill:#e3f2fd,stroke:#2196f3
    style C fill:#e8f5e9,stroke:#43a047
    style D fill:#e8f5e9,stroke:#43a047
    style E fill:#f3e5f5,stroke:#9c27b0
    style F fill:#f3e5f5,stroke:#9c27b0
    style G fill:#f3e5f5,stroke:#9c27b0
    style H fill:#f3e5f5,stroke:#9c27b0
    style I fill:#fff3e0,stroke:#ff9800
    style J fill:#fff3e0,stroke:#ff9800
    style K fill:#fff3e0,stroke:#ff9800
    style L fill:#fff3e0,stroke:#ff9800
    style M fill:#fafafa,stroke:#607d8b
    style N fill:#fafafa,stroke:#607d8b`;
    } else if (cleanMermaidCode.length < 10) {
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
      flowchart: { 
        useMaxWidth: false,
        htmlLabels: true,
        curve: 'basis' 
      },
      securityLevel: 'loose', // This allows for downloading the SVG properly
      fontFamily: 'Arial, sans-serif', // Use basic, widely supported font
      themeVariables: {
        fontFamily: 'Arial, sans-serif',
        primaryTextColor: '#333333',
        primaryColor: '#2196f3',
        primaryBorderColor: '#2196f3',
        lineColor: '#333333',
        fontSize: '16px'
      }
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
        // Handle forceRedraw message for screenshots
        if (event.data.action === 'forceRedraw') {
          console.log('Forcing diagram redraw...');
          try {
            // Get the mermaid element and re-render
            const mermaidElement = document.querySelector('.mermaid');
            if (mermaidElement) {
              const code = mermaidElement.textContent || '';
              // Clear the element
              mermaidElement.innerHTML = '';
              // Force redraw
              setTimeout(function() {
                mermaidElement.textContent = code;
                mermaid.init(undefined, document.querySelectorAll('.mermaid'));
              }, 50);
            }
          } catch (e) {
            console.error('Error redrawing diagram:', e);
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
      max-width: 2400px;
      width: 100%;
      margin: 0 auto;
      overflow: visible;
      position: relative;
    }
    .mermaid {
      text-align: center;
      width: 100%;
      overflow: visible;
      min-height: 500px;
    }
    .mermaid svg {
      max-width: 100%;
      width: auto !important;
      height: auto !important;
      font-family: Arial, sans-serif !important;
      display: block;
      margin: 0 auto;
    }
    /* Force basic fonts on all text elements in the SVG */
    .mermaid svg text, .mermaid svg tspan {
      font-family: Arial, sans-serif !important;
      font-weight: normal;
    }
    h1 {
      text-align: center;
      color: #0078d4;
      margin-bottom: 20px;
    }
    /* Add styles for the code view in case mermaid fails */
    pre.code-fallback {
      white-space: pre-wrap;
      font-size: 12px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 4px;
      margin-top: 20px;
      overflow: auto;
      max-height: 300px;
      display: none; /* Hide by default */
    }
    .error-message {
      color: #d32f2f;
      padding: 15px;
      text-align: center;
      font-weight: bold;
      display: none; /* Hide by default */
    }
    
    /* Print styles */
    @media print {
      body {
        background: white;
        padding: 0;
        margin: 0;
      }
      .diagram-container {
        box-shadow: none;
        width: 100%;
        padding: 0;
        margin: 0;
      }
      .action-buttons {
        display: none !important;
      }
      .mermaid svg {
        max-width: 100% !important;
        width: 100% !important;
        height: auto !important;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="diagram-container">
    <h1>${isNetworkDiagram ? 'RiverMeadow Network Architecture' : 'RiverMeadow Migration Diagram'}</h1>
    <div class="mermaid">
${cleanMermaidCode}
    </div>
    <div class="error-message">Failed to render diagram</div>
    <pre class="code-fallback">${cleanMermaidCode}</pre>
  </div>
  <script>
    // Add error handling in case mermaid fails to parse
    mermaid.parseError = function(err, hash) {
      console.error('Mermaid error:', err);
      document.querySelector('.error-message').style.display = 'block';
      document.querySelector('.code-fallback').style.display = 'block';
    };
    
    // Render mermaid diagram with a delay to ensure DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() {
        try {
          console.log('Initializing mermaid diagram...');
          mermaid.init(undefined, document.querySelectorAll('.mermaid'));
        } catch (e) {
          console.error('Error initializing mermaid:', e);
        }
      }, 1000);
    });
  </script>
</body>
</html>`;

    // Create timestamp & unique filename with a common base
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    const baseFilename = `generated_diagram_${timestamp}_${uuid}`;
    const htmlFilename = `${baseFilename}.html`;
    const mmdFilename = `${baseFilename}.mmd`;
    
    const htmlPath = path.join(GENERATED_IMAGES_DIR, htmlFilename);
    const mmdPath = path.join(GENERATED_IMAGES_DIR, mmdFilename);
    
    // Save HTML file to disk
    await writeFile(htmlPath, htmlContent);
    
    // Save mermaid code to a separate .mmd file for mmdc conversion
    await writeFile(mmdPath, cleanMermaidCode);
    
    console.log(`Successfully generated and saved diagram: ${htmlFilename} and ${mmdFilename}`);
    
    return {
      imagePath: `/uploads/generated/${htmlFilename}`,
      mmdPath: `/uploads/generated/${mmdFilename}`,
      mmdFilename,
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
  
  // Special case: if prompt is related to OS migration, consider it a diagram request
  if (/\bos\s*(?:based|-)?\s*migration\b/i.test(lowercasePrompt)) {
    console.log('Direct OS migration diagram request detected');
    return true;
  }

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
    /(?:rivermeadow|migration)\s+(?:diagram|architecture|flow|process)/i,
    
    // Special case for OS-based migration tool - consider it a diagram request
    /(?:create|make|generate|build)?\s*(?:os|operating system)?\s*(?:based|-)?\s*migration\s*(?:tool|solution|application|process)/i
  ];

  const regexMatch = imageRequestPatterns.some(pattern => pattern.test(prompt));
  if (regexMatch) {
    console.log('Image generation request detected via specific pattern matching');
    return true;
  }
  
  console.log('No clear diagram request detected');
  return false;
};