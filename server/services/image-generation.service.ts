import { writeFile, mkdir } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from "openai";
import { storage } from '../storage';

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Define the directories for storing images
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const GENERATED_IMAGES_DIR = path.join(UPLOADS_DIR, 'generated');
const PNG_DIR = path.join(UPLOADS_DIR, 'png');

/**
 * Create necessary directories for storing images
 */
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

/**
 * Enhance prompt with specific diagram language based on the diagram type
 * Includes variability to ensure uniqueness in generated diagrams
 */
const enhancePrompt = (prompt: string, isNetworkDiagram: boolean): string => {
  // Add RiverMeadow terminology and diagram-specific enhancements
  let enhancedPrompt = prompt;
  const lowercasePrompt = prompt.toLowerCase();
  
  // Add a unique identifier to ensure different results each time
  const uniqueId = Date.now().toString().slice(-4);
  enhancedPrompt += ` (Request ID: ${uniqueId})`;
  
  // Detect diagram theme from prompt for more specific enhancements
  const isCloudFocused = lowercasePrompt.includes('cloud') || 
                        lowercasePrompt.includes('aws') ||
                        lowercasePrompt.includes('azure') ||
                        lowercasePrompt.includes('gcp');
                        
  const isSoftwareFocused = lowercasePrompt.includes('software') || 
                           lowercasePrompt.includes('application') ||
                           lowercasePrompt.includes('program') ||
                           lowercasePrompt.includes('code');
                           
  const isProcessFocused = lowercasePrompt.includes('process') || 
                          lowercasePrompt.includes('workflow') ||
                          lowercasePrompt.includes('steps') ||
                          lowercasePrompt.includes('procedure');
                          
  const isOsMigrationFocused = lowercasePrompt.includes('os migration') ||
                              lowercasePrompt.includes('os-based migration') ||
                              (lowercasePrompt.includes('os') && lowercasePrompt.includes('migration'));
  
  // Select different enhancement styles based on request type
  const enhancementVariants = [];
  
  if (isNetworkDiagram) {
    if (isCloudFocused) {
      enhancementVariants.push(
        " Create a visually distinct cloud architecture showing source systems, target cloud environments, and RiverMeadow Migration Server. Use cloud provider icons and show network connections between on-premises and cloud components.",
        " Design a modern cloud infrastructure diagram showing migration paths from on-premises to cloud targets via RiverMeadow. Include security components and data flow directions.",
        " Illustrate a detailed cloud migration architecture with source systems, target environments, and the RiverMeadow platform. Show all network connections and security boundaries."
      );
    } else {
      enhancementVariants.push(
        " Design a comprehensive network diagram showing source systems, target systems, and RiverMeadow Migration Server. Include network connections, firewalls, and data flow direction with appropriate networking icons.",
        " Create a detailed infrastructure diagram with source and target environments connected through RiverMeadow's migration platform. Show all network components and connectivity paths.",
        " Illustrate the network topology for RiverMeadow's migration solution, showing detailed connections between source servers, the migration platform, and target environments."
      );
    }
  } else if (isProcessFocused) {
    enhancementVariants.push(
      " Create a detailed flowchart showing the key steps, decision points, and workflow in RiverMeadow's migration process. Include clearly marked start and end points with distinct visual elements.",
      " Design a comprehensive process diagram illustrating the RiverMeadow migration workflow with all steps from initial assessment to final validation. Use distinctive shapes for different process types.",
      " Illustrate the sequential steps in the RiverMeadow migration process, showing all decision points, actions, and outcomes with clear connections between steps."
    );
  } else if (isSoftwareFocused) {
    enhancementVariants.push(
      " Create a component diagram showing the software architecture, interfaces, and data flow in the RiverMeadow system. Include API connections and integration points with external systems.",
      " Design a software architecture diagram that illustrates how RiverMeadow's components interact with each other and with external systems. Show data flow and system boundaries.",
      " Illustrate the software components and their relationships within the RiverMeadow platform, including all services, interfaces, and connections to source and target environments."
    );
  } else if (isOsMigrationFocused) {
    enhancementVariants.push(
      " Design a unique OS migration diagram showing the complete workflow from source OS assessment to target OS deployment using RiverMeadow's platform. Include all key steps with detailed labels.",
      " Create a comprehensive visualization of the OS migration process showing both technical and business considerations. Include steps for data migration, application compatibility, and post-migration testing.",
      " Illustrate a detailed OS migration path with specific focus on the technical challenges and solutions provided by RiverMeadow. Show all components involved in the migration process."
    );
  } else {
    // Generic enhancement variants as fallback
    enhancementVariants.push(
      " Create a clear and detailed diagram illustrating the migration process or architecture in the context of RiverMeadow's cloud migration platform. Use distinctive visual elements.",
      " Design a comprehensive visualization of RiverMeadow's migration solution, showing key components, processes, and relationships with clear visual hierarchy.",
      " Illustrate the complete RiverMeadow migration ecosystem, including all major components and their relationships in a visually engaging layout."
    );
  }
  
  // Select a random enhancement variant to ensure uniqueness
  const randomIndex = Math.floor(Math.random() * enhancementVariants.length);
  enhancedPrompt += enhancementVariants[randomIndex];
  
  return enhancedPrompt;
};

/**
 * Generate a diagram based on a prompt
 */
export const generateDiagram = async (
  prompt: string,
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
    
    // Determine if this is a network diagram request
    const isNetworkDiagram = detectNetworkDiagramRequest(prompt);
    console.log(`Network diagram detection: ${isNetworkDiagram ? 'Yes' : 'No'}`);
    
    // Enhance the prompt with specific diagram language
    const enhancedPrompt = enhancePrompt(prompt, isNetworkDiagram);
    
    // Try to use Draw.IO first if requested
    if (useDrawIO) {
      try {
        console.log('Attempting to generate Draw.IO diagram');
        
        // Detect specific diagram types from the prompt
        const lowercasePrompt = prompt.toLowerCase();
        const isCloudFocused = lowercasePrompt.includes('cloud') || 
                              lowercasePrompt.includes('aws') ||
                              lowercasePrompt.includes('azure') ||
                              lowercasePrompt.includes('gcp');
        
        const isSoftwareFocused = lowercasePrompt.includes('software') || 
                                 lowercasePrompt.includes('application') ||
                                 lowercasePrompt.includes('program') ||
                                 lowercasePrompt.includes('code');
        
        const isOsMigrationFocused = lowercasePrompt.includes('os migration') ||
                                    lowercasePrompt.includes('os-based migration') ||
                                    (lowercasePrompt.includes('os') && lowercasePrompt.includes('migration'));
        
        // Define the system prompt for Draw.IO XML generation based on diagram type
        let systemMessage = "";
        if (isNetworkDiagram) {
          systemMessage = "You are an expert at creating network architecture diagrams using Draw.IO (diagrams.net). Generate only valid XML for Draw.IO that visualizes RiverMeadow migration architecture. Use different icons for different types of network components. Include detailed labels for all diagram elements.";
        } else if (isOsMigrationFocused) {
          systemMessage = "You are an expert at creating OS migration diagrams using Draw.IO (diagrams.net). Generate only valid XML for Draw.IO that visualizes the OS migration process with RiverMeadow. Use distinctive shapes and colors for different phases of migration. Include detailed labels and connections.";
        } else if (isSoftwareFocused) {
          systemMessage = "You are an expert at creating software architecture diagrams using Draw.IO (diagrams.net). Generate only valid XML for Draw.IO that visualizes RiverMeadow software components and interfaces. Use appropriate icons for different types of software components. Include clear labels and connection types.";
        } else {
          systemMessage = "You are an expert at creating flowchart diagrams using Draw.IO (diagrams.net). Generate only valid XML for Draw.IO that visualizes RiverMeadow migration processes. Use varied shapes and colors for different process types. Include detailed labels and clear directional flow.";
        }
        
        // Define the user message based on diagram type
        let userMessage = "";
        
        if (isNetworkDiagram) {
          // Network architecture diagram instructions
          if (isCloudFocused) {
            userMessage = `Create a detailed cloud architecture diagram in Draw.IO XML format for: ${enhancedPrompt}
            
Include these elements in your design:
1. Source on-premises systems with appropriate icons
2. RiverMeadow Migration Server and related components
3. Target cloud environments with cloud-specific icons (AWS/Azure/GCP as appropriate)
4. Network connections showing data flow between components
5. Security elements like firewalls, VPNs, and secure connections
6. Clear labels for all components and connections
7. Use different colors for source, migration, and target environments
8. Group related components together visually
9. Add a title and brief legend

Make the diagram visually distinct with a professional appearance. Use appropriate cloud icons for different services. Only return valid Draw.IO XML without any explanation.`;
          } else {
            userMessage = `Create a network infrastructure diagram in Draw.IO XML format for: ${enhancedPrompt}
            
Include these elements in your design:
1. Source servers or systems with hardware-appropriate icons
2. RiverMeadow Migration Server and related components
3. Target environments (physical or virtual)
4. Network connections between components showing data flow direction
5. Security elements like firewalls and network boundaries
6. Use appropriate icons for servers, routers, switches, storage, and other hardware
7. Clear labels for all components and connections
8. Use different colors to distinguish different network segments
9. Include a title and brief legend

Make the diagram visually professional with clear component relationships. Only return valid Draw.IO XML without any explanation.`;
          }
        } else if (isOsMigrationFocused) {
          // OS migration diagram instructions
          userMessage = `Create a unique OS migration diagram in Draw.IO XML format for: ${enhancedPrompt}
          
Design a comprehensive diagram that includes:
1. Source OS environment with appropriate icons and labels
2. Target OS environment with distinctive representation
3. RiverMeadow migration components and tools
4. Migration workflow with clear step sequence
5. Data and application migration paths
6. Decision points and validation steps
7. Pre and post-migration activities
8. Use different shapes and colors for different phases
9. Include a title and timeline elements if appropriate

Make this diagram visually distinct from generic migration flowcharts. Highlight technical aspects specific to OS migration. Only return valid Draw.IO XML without any explanation.`;
        } else if (isSoftwareFocused) {
          // Software architecture diagram instructions
          userMessage = `Create a software architecture diagram in Draw.IO XML format for: ${enhancedPrompt}
          
Design a detailed software diagram that includes:
1. RiverMeadow software components with appropriate icons
2. Component relationships and dependencies
3. APIs and integration points
4. Data flow between components
5. External systems and interfaces
6. User interaction points
7. Clear labels for all components and interfaces
8. Use different shapes and colors for different component types
9. Group related functionality together
10. Include a title and legend

Make the diagram technically precise with modern software architecture elements. Only return valid Draw.IO XML without any explanation.`;
        } else {
          // Default process flowchart instructions
          userMessage = `Create a flowchart diagram in Draw.IO XML format for: ${enhancedPrompt}
          
Design a clear process flow that includes:
1. Distinctive start and end points
2. All key decision points with different outcome paths
3. Main process steps in logical sequence
4. Connections between steps showing process flow
5. Use different colors and shapes to distinguish between different types of steps
6. Include subprocess groupings if appropriate
7. Clear labels for all steps and decisions
8. Time or sequence indicators if relevant
9. Include a title that describes the specific process

Make this flowchart visually distinctive with professional styling. Only return valid Draw.IO XML without any explanation.`;
        }
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          max_tokens: 4000,
          temperature: 0.8,  // Increased temperature for more variation
        });
        
        // Extract the Draw.IO XML from the response
        const drawioXml = response.choices[0].message.content?.trim() || "";
        
        // Clean up XML - remove markdown code blocks if present
        const cleanXml = drawioXml
          .replace(/```xml/g, '')
          .replace(/```drawio/g, '')
          .replace(/```/g, '')
          .trim();
        
        // Create timestamp & unique filename
        const timestamp = Date.now();
        const uuid = uuidv4().substring(0, 8);
        const xmlFilename = `diagram_${timestamp}_${uuid}.drawio`;
        const htmlFilename = `diagram_${timestamp}_${uuid}.html`;
        
        // Set file paths
        const xmlPath = path.join(GENERATED_IMAGES_DIR, xmlFilename);
        const htmlPath = path.join(GENERATED_IMAGES_DIR, htmlFilename);
        
        // Save the Draw.IO XML to a file
        await writeFile(xmlPath, cleanXml);
        
        // Create HTML for the Draw.IO diagram using string concatenation
        const titleText = isNetworkDiagram ? 'RiverMeadow Network Architecture' : 'RiverMeadow Migration Diagram';
        let drawioHtml = "<!DOCTYPE html>";
        drawioHtml += "<html lang=\"en\">";
        drawioHtml += "<head>";
        drawioHtml += "  <meta charset=\"UTF-8\">";
        drawioHtml += "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">";
        drawioHtml += "  <title>RiverMeadow Diagram</title>";
        drawioHtml += "  <style>";
        drawioHtml += "    body, html { height: 100%; margin: 0; padding: 0; overflow: auto; font-family: Arial, sans-serif; }";
        drawioHtml += "    .diagram-container { display: flex; flex-direction: column; height: 100vh; }";
        drawioHtml += "    .header { background: white; padding: 10px 20px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; z-index: 10; }";
        drawioHtml += "    h1 { color: #0078d4; margin: 0; font-size: 18px; }";
        drawioHtml += "    .content-area { flex: 1; padding: 20px; overflow: auto; background: white; display: flex; flex-direction: column; align-items: center; position: relative; }";
        drawioHtml += "    #svg-container { max-width: 100%; transition: transform 0.3s; transform-origin: center top; margin: 0 auto; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 4px; padding: 16px; position: relative; cursor: grab; pointer-events: all; }";
        drawioHtml += "    #svg-container:active { cursor: grabbing; }"; 
        drawioHtml += "    #svg-container svg { pointer-events: none; width: 100%; height: 100%; }";
        drawioHtml += "    #svg-container svg * { pointer-events: none; }";
        drawioHtml += "    svg { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }";
        drawioHtml += "    .actions { display: flex; gap: 10px; }";
        drawioHtml += "    .button { background-color: #0078d4; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; }";
        drawioHtml += "    .button:hover { background-color: #005a9e; }";
        drawioHtml += "    .button-download { background-color: #28a745; }";
        drawioHtml += "    .button-download:hover { background-color: #218838; }";
        drawioHtml += "    .loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #666; background: rgba(255,255,255,0.9); padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; }";
        drawioHtml += "    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #0078d4; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 15px; }";
        drawioHtml += "    .hidden { display: none; }";
        drawioHtml += "    .zoom-controls { position: fixed; bottom: 20px; right: 20px; background: white; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); display: flex; overflow: hidden; z-index: 100; }";
        drawioHtml += "    .zoom-button { background: none; border: none; border-right: 1px solid #eee; padding: 8px 12px; cursor: pointer; font-size: 14px; }";
        drawioHtml += "    .zoom-button:last-child { border-right: none; }";
        drawioHtml += "    .zoom-button:hover { background: #f5f5f5; }";
        drawioHtml += "    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }";
        drawioHtml += "  </style>";
        drawioHtml += "</head>";
        drawioHtml += "<body>";
        drawioHtml += "  <div class=\"diagram-container\">";
        drawioHtml += "    <div class=\"header\">";
        drawioHtml += "      <h1>" + titleText + "</h1>";
        drawioHtml += "      <div class=\"actions\">";
        const baseFileName = xmlFilename.replace(/\.(xml|drawio)$/, '');
        drawioHtml += "        <a href=\"/api/download-full-diagram/" + baseFileName + "\" download=\"rivermeadow_diagram.png\" class=\"button button-download\">Download PNG</a>";
        drawioHtml += "        <a href=\"/api/diagram-xml/" + xmlFilename + "\" download=\"rivermeadow_diagram.drawio\" class=\"button\">Download Source</a>";
        drawioHtml += "      </div>";
        drawioHtml += "    </div>";
        drawioHtml += "    <div class=\"content-area\">";
        drawioHtml += "      <div id=\"loading\" class=\"loading\">";
        drawioHtml += "        <div class=\"spinner\"></div>";
        drawioHtml += "        <div>Loading diagram...</div>";
        drawioHtml += "      </div>";
        drawioHtml += "      <div id=\"svg-container\"></div>";
        drawioHtml += "    </div>";
        drawioHtml += "    <div class=\"zoom-controls\">";
        drawioHtml += "      <button class=\"zoom-button\" id=\"zoom-out\">−</button>";
        drawioHtml += "      <button class=\"zoom-button\" id=\"zoom-reset\">100%</button>";
        drawioHtml += "      <button class=\"zoom-button\" id=\"zoom-in\">+</button>";
        drawioHtml += "    </div>";
        drawioHtml += "  </div>";
        drawioHtml += "  <script>";
        drawioHtml += "    const svgContainer = document.getElementById('svg-container');";
        drawioHtml += "    const loading = document.getElementById('loading');";
        drawioHtml += "    const zoomResetButton = document.getElementById('zoom-reset');";
        drawioHtml += "    let currentZoom = 0.5;";
        drawioHtml += "    try {";
        drawioHtml += "      const savedZoom = localStorage.getItem('diagram_zoom_level');";
        drawioHtml += "      if (savedZoom && !isNaN(parseFloat(savedZoom))) {";
        drawioHtml += "        currentZoom = parseFloat(savedZoom);";
        drawioHtml += "      }";
        drawioHtml += "    } catch (e) {}";
        drawioHtml += "    if (zoomResetButton) {";
        drawioHtml += "      zoomResetButton.textContent = Math.round(currentZoom * 100) + '%';";
        drawioHtml += "    }";
        drawioHtml += "    fetch('/api/diagram-svg/" + xmlFilename + "')";
        drawioHtml += "      .then(response => {";
        drawioHtml += "        if (!response.ok) throw new Error('Failed to load diagram');";
        drawioHtml += "        return response.text();";
        drawioHtml += "      })";
        drawioHtml += "      .then(svgText => {";
        drawioHtml += "        svgContainer.innerHTML = svgText;";
        drawioHtml += "        loading.classList.add('hidden');";
        drawioHtml += "        const svg = svgContainer.querySelector('svg');";
        drawioHtml += "        if (svg) {";
        drawioHtml += "          svg.style.maxWidth = '100%';";
        drawioHtml += "          svg.style.height = 'auto';";
        drawioHtml += "          svg.style.transformOrigin = 'center';";
        drawioHtml += "        }";
        drawioHtml += "        applyZoom();";
        drawioHtml += "      })";
        drawioHtml += "      .catch(error => {";
        drawioHtml += "        console.error('Error loading SVG:', error);";
        drawioHtml += "        loading.innerHTML = '<div style=\"color:red\">Error loading diagram</div>';";
        drawioHtml += "      });";
        drawioHtml += "    document.getElementById('zoom-in').addEventListener('click', () => {";
        drawioHtml += "      currentZoom = Math.min(2.5, currentZoom + 0.1);";
        drawioHtml += "      applyZoom();";
        drawioHtml += "    });";
        drawioHtml += "    document.getElementById('zoom-out').addEventListener('click', () => {";
        drawioHtml += "      currentZoom = Math.max(0.2, currentZoom - 0.1);";
        drawioHtml += "      applyZoom();";
        drawioHtml += "    });";
        drawioHtml += "    document.getElementById('zoom-reset').addEventListener('click', () => {";
        drawioHtml += "      currentZoom = 1.0;";
        drawioHtml += "      applyZoom();";
        drawioHtml += "    });";
        drawioHtml += "    // Initialize drag functionality";
        drawioHtml += "    let isDragging = false;";
        drawioHtml += "    let startX, startY, initialOffsetX = 0, initialOffsetY = 0;";
        drawioHtml += "    ";
        drawioHtml += "    if (svgContainer) {";
        drawioHtml += "      svgContainer.addEventListener('mousedown', (e) => {";
        drawioHtml += "        // Only start dragging on primary button (usually left button)";
        drawioHtml += "        if (e.button === 0) {";
        drawioHtml += "          isDragging = true;";
        drawioHtml += "          startX = e.clientX;";
        drawioHtml += "          startY = e.clientY;";
        drawioHtml += "          // Extract current transform values";
        drawioHtml += "          const style = window.getComputedStyle(svgContainer);";
        drawioHtml += "          const transform = style.transform || 'translate(0px, 0px) scale(1)';";
        drawioHtml += "          const translateMatch = transform.match(/translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\)/);";
        drawioHtml += "          if (translateMatch) {";
        drawioHtml += "            initialOffsetX = parseFloat(translateMatch[1]) || 0;";
        drawioHtml += "            initialOffsetY = parseFloat(translateMatch[2]) || 0;";
        drawioHtml += "          } else {";
        drawioHtml += "            initialOffsetX = 0;";
        drawioHtml += "            initialOffsetY = 0;";
        drawioHtml += "          }";
        drawioHtml += "          e.preventDefault();";
        drawioHtml += "        }";
        drawioHtml += "      });";
        drawioHtml += "    }";
        drawioHtml += "    ";
        drawioHtml += "    document.addEventListener('mousemove', (e) => {";
        drawioHtml += "      if (isDragging) {";
        drawioHtml += "        const dx = e.clientX - startX;";
        drawioHtml += "        const dy = e.clientY - startY;";
        drawioHtml += "        const newX = initialOffsetX + dx;";
        drawioHtml += "        const newY = initialOffsetY + dy;";
        drawioHtml += "        svgContainer.style.transform = 'translate(' + newX + 'px, ' + newY + 'px) scale(' + currentZoom + ')';";
        drawioHtml += "      }";
        drawioHtml += "    });";
        drawioHtml += "    ";
        drawioHtml += "    document.addEventListener('mouseup', () => {";
        drawioHtml += "      isDragging = false;";
        drawioHtml += "    });";
        drawioHtml += "    ";
        drawioHtml += "    document.addEventListener('mouseleave', () => {";
        drawioHtml += "      isDragging = false;";
        drawioHtml += "    });";
        drawioHtml += "    ";
        drawioHtml += "    function applyZoom() {";
        drawioHtml += "      if (svgContainer) {";
        drawioHtml += "        // Keep the transform position when changing zoom";
        drawioHtml += "        const style = window.getComputedStyle(svgContainer);";
        drawioHtml += "        const transform = style.transform || 'translate(0px, 0px) scale(1)';";
        drawioHtml += "        const translateMatch = transform.match(/translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\)/);";
        drawioHtml += "        const translateX = translateMatch ? parseFloat(translateMatch[1]) : 0;";
        drawioHtml += "        const translateY = translateMatch ? parseFloat(translateMatch[2]) : 0;";
        drawioHtml += "        ";
        drawioHtml += "        svgContainer.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + currentZoom + ')';";
        drawioHtml += "        const resetButton = document.getElementById('zoom-reset');";
        drawioHtml += "        if (resetButton) {";
        drawioHtml += "          resetButton.textContent = Math.round(currentZoom * 100) + '%';";
        drawioHtml += "        }";
        drawioHtml += "        try {";
        drawioHtml += "          localStorage.setItem('diagram_zoom_level', currentZoom.toString());";
        drawioHtml += "        } catch (e) {}";
        drawioHtml += "      }";
        drawioHtml += "    }";
        drawioHtml += "  </script>";
        drawioHtml += "</body>";
        drawioHtml += "</html>";

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
      mermaidPrompt = "Create a mermaid.js network diagram code for: " + enhancedPrompt + "\n" +
      "Use the appropriate syntax for network diagrams. In Mermaid, you can represent networks using:\n" +
      "1. flowchart LR - for left-to-right network diagrams\n" +
      "2. Use different node shapes to represent network components:\n" +
      "   - ((Database)) for databases\n" +
      "   - [Server] for servers\n" +
      "   - {{Firewall}} for firewalls\n" +
      "   - (Router) for routers\n" +
      "   - [/Load Balancer/] for load balancers\n" +
      "   - [(Storage)] for storage\n" +
      "   - [Cloud] for cloud services\n\n" +
      "Keep the diagram focused on the key network components and their connections.\n" +
      "Only generate valid mermaid.js code wrapped in a code block, nothing else. Use proper RiverMeadow terminology.";
    } else {
      mermaidPrompt = "Create a mermaid.js diagram code for: " + enhancedPrompt + "\n" +
      "The diagram should be a flowchart (use flowchart TD syntax). Keep it simple and focused on the main steps.\n" +
      "For example, if it's about OS migration steps, show the main 5-7 steps in the process.\n" +
      "Only generate valid mermaid.js code wrapped in a code block, nothing else. Use RiverMeadow terminology.";
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
    
    // Check for minimum valid mermaid code length
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
    
    // Create an HTML file with the mermaid diagram using string concatenation
    const diagramTitle = isNetworkDiagram ? 'RiverMeadow Network Architecture' : 'RiverMeadow Migration Diagram';
    const htmlContent = '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>RiverMeadow Diagram</title>' +
'  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>' +
'  <script>' +
'    mermaid.initialize({' +
'      startOnLoad: true,' +
'      theme: "neutral",' +
'      flowchart: { ' +
'        useMaxWidth: false,' +
'        htmlLabels: true,' +
'        curve: "basis" ' +
'      },' +
'      securityLevel: "loose",' +
'      fontFamily: "Arial, sans-serif",' +
'      themeVariables: {' +
'        fontFamily: "Arial, sans-serif",' +
'        primaryTextColor: "#333333",' +
'        primaryColor: "#2196f3",' +
'        primaryBorderColor: "#2196f3",' +
'        lineColor: "#333333",' +
'        fontSize: "16px"' +
'      }' +
'    });' +
'    ' +
'    window.addEventListener("load", function() {' +
'      if (window.parent) {' +
'        window.parent.postMessage("diagramLoaded", "*");' +
'      }' +
'    });' +
'    ' +
'    window.addEventListener("message", function(event) {' +
'      if (event.data && typeof event.data === "object") {' +
'        if (event.data.action === "zoom") {' +
'          const diagram = document.querySelector(".diagram-container");' +
'          if (diagram) {' +
'            const mermaidDiv = document.querySelector(".mermaid svg");' +
'            if (mermaidDiv) {' +
'              mermaidDiv.style.transform = "scale(" + event.data.scale + ")";' +
'              mermaidDiv.style.transformOrigin = "50% 0";' +
'              mermaidDiv.style.transition = "transform 0.2s ease";' +
'            }' +
'          }' +
'        }' +
'        if (event.data.action === "forceRedraw") {' +
'          console.log("Forcing diagram redraw...");' +
'          try {' +
'            const mermaidElement = document.querySelector(".mermaid");' +
'            if (mermaidElement) {' +
'              const code = mermaidElement.textContent || "";' +
'              mermaidElement.innerHTML = "";' +
'              setTimeout(function() {' +
'                mermaidElement.textContent = code;' +
'                mermaid.init(undefined, document.querySelectorAll(".mermaid"));' +
'              }, 50);' +
'            }' +
'          } catch (e) {' +
'            console.error("Error redrawing diagram:", e);' +
'          }' +
'        }' +
'      }' +
'    });' +
'  </script>' +
'  <style>' +
'    body {' +
'      font-family: Arial, sans-serif;' +
'      margin: 0;' +
'      padding: 20px;' +
'      background: #f5f5f5;' +
'    }' +
'    .diagram-container {' +
'      background: white;' +
'      padding: 20px;' +
'      border-radius: 8px;' +
'      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);' +
'      max-width: 2400px;' +
'      width: 100%;' +
'      margin: 0 auto;' +
'      overflow: visible;' +
'      position: relative;' +
'      cursor: grab;' +
'    }' +
'    .diagram-container:active {' +
'      cursor: grabbing;' +
'    }' +
'    .mermaid {' +
'      text-align: center;' +
'      width: 100%;' +
'      overflow: visible;' +
'      min-height: 500px;' +
'    }' +
'    .mermaid svg {' +
'      max-width: 100%;' +
'      width: auto !important;' +
'      height: auto !important;' +
'      font-family: Arial, sans-serif !important;' +
'      display: block;' +
'      margin: 0 auto;' +
'    }' +
'    .mermaid svg text, .mermaid svg tspan {' +
'      font-family: Arial, sans-serif !important;' +
'      font-weight: normal;' +
'    }' +
'    h1 {' +
'      text-align: center;' +
'      color: #0078d4;' +
'      margin-bottom: 20px;' +
'    }' +
'    pre.code-fallback {' +
'      white-space: pre-wrap;' +
'      font-size: 12px;' +
'      padding: 10px;' +
'      background: #f5f5f5;' +
'      border-radius: 4px;' +
'      margin-top: 20px;' +
'      overflow: auto;' +
'      max-height: 300px;' +
'      display: none;' +
'    }' +
'    .error-message {' +
'      color: #d32f2f;' +
'      padding: 15px;' +
'      text-align: center;' +
'      font-weight: bold;' +
'      display: none;' +
'    }' +
'    @media print {' +
'      body {' +
'        background: white;' +
'        padding: 0;' +
'        margin: 0;' +
'      }' +
'      .diagram-container {' +
'        box-shadow: none;' +
'        width: 100%;' +
'        padding: 0;' +
'        margin: 0;' +
'      }' +
'      .action-buttons {' +
'        display: none !important;' +
'      }' +
'      .mermaid svg {' +
'        max-width: 100% !important;' +
'        width: 100% !important;' +
'        height: auto !important;' +
'        page-break-inside: avoid;' +
'      }' +
'    }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="diagram-container">' +
'    <h1>' + diagramTitle + '</h1>' +
'    <div class="mermaid">' +
cleanMermaidCode +
'    </div>' +
'    <div class="error-message">Failed to render diagram</div>' +
'    <pre class="code-fallback">' + cleanMermaidCode + '</pre>' +
'  </div>' +
'  <script>' +
'    mermaid.parseError = function(err, hash) {' +
'      console.error("Mermaid error:", err);' +
'      document.querySelector(".error-message").style.display = "block";' +
'      document.querySelector(".code-fallback").style.display = "block";' +
'    };' +
'    ' +
'    document.addEventListener("DOMContentLoaded", function() {' +
'      setTimeout(function() {' +
'        try {' +
'          console.log("Initializing mermaid diagram...");' +
'          mermaid.init(undefined, document.querySelectorAll(".mermaid"));' +
'        } catch (e) {' +
'          console.error("Error initializing mermaid:", e);' +
'        }' +
'      }, 1000);' +
'    });' +
'    ' +
'    // Initialize drag functionality' +
'    let isDragging = false;' +
'    let startX, startY, initialOffsetX = 0, initialOffsetY = 0;' +
'    const container = document.querySelector(".diagram-container");' +
'    ' +
'    if (container) {' +
'      container.addEventListener("mousedown", function(e) {' +
'        if (e.button === 0) {' +
'          isDragging = true;' +
'          startX = e.clientX;' +
'          startY = e.clientY;' +
'          const style = window.getComputedStyle(container);' +
'          const transform = style.transform || "translate(0px, 0px)";' +
'          const translateMatch = transform.match(/translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\)/);' +
'          if (translateMatch) {' +
'            initialOffsetX = parseFloat(translateMatch[1]) || 0;' +
'            initialOffsetY = parseFloat(translateMatch[2]) || 0;' +
'          } else {' +
'            initialOffsetX = 0;' +
'            initialOffsetY = 0;' +
'          }' +
'          e.preventDefault();' +
'        }' +
'      });' +
'    }' +
'    ' +
'    document.addEventListener("mousemove", function(e) {' +
'      if (isDragging && container) {' +
'        const dx = e.clientX - startX;' +
'        const dy = e.clientY - startY;' +
'        const newX = initialOffsetX + dx;' +
'        const newY = initialOffsetY + dy;' +
'        container.style.transform = "translate(" + newX + "px, " + newY + "px)";' +
'      }' +
'    });' +
'    ' +
'    document.addEventListener("mouseup", function() {' +
'      isDragging = false;' +
'    });' +
'    ' +
'    document.addEventListener("mouseleave", function() {' +
'      isDragging = false;' +
'    });' +
'  </script>' +
'</body>' +
'</html>';

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
 * Detect if the user is requesting a network/hardware diagram specifically
 * This is important for applying the right styling and icons in the diagram
 */
function detectNetworkDiagramRequest(prompt: string): boolean {
  // Convert to lowercase for case-insensitive matching
  const lowercasePrompt = prompt.toLowerCase();
  
  // Keywords that indicate a network/hardware/infrastructure diagram request
  const networkKeywords = [
    // Network specific
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
    'system topology',
    
    // Hardware specific
    'hardware diagram',
    'physical architecture',
    'server layout',
    'data center',
    'rack layout',
    'hardware components',
    'device connectivity',
    
    // Technical infrastructure
    'technical architecture',
    'it infrastructure',
    'enterprise architecture',
    'technology stack',
    'hosting environment',
    'virtualization diagram'
  ];
  
  // Check if any network/hardware keywords are in the prompt
  const hasNetworkHardwareKeyword = networkKeywords.some(keyword => 
    lowercasePrompt.includes(keyword)
  );
  
  // Additional check for common network/hardware-related terms combined with diagram requests
  const hasNetworkHardwareContext = 
    (lowercasePrompt.includes('network') || 
     lowercasePrompt.includes('infrastructure') || 
     lowercasePrompt.includes('cloud') || 
     lowercasePrompt.includes('server') || 
     lowercasePrompt.includes('router') || 
     lowercasePrompt.includes('firewall') ||
     lowercasePrompt.includes('vpn') ||
     lowercasePrompt.includes('aws') ||
     lowercasePrompt.includes('azure') ||
     lowercasePrompt.includes('gcp') ||
     lowercasePrompt.includes('data center') ||
     lowercasePrompt.includes('hardware') ||
     lowercasePrompt.includes('physical') ||
     lowercasePrompt.includes('virtual machine') ||
     lowercasePrompt.includes('vm') ||
     lowercasePrompt.includes('database') ||
     lowercasePrompt.includes('storage') ||
     lowercasePrompt.includes('equipment') ||
     lowercasePrompt.includes('compute') ||
     lowercasePrompt.includes('device')) && 
    (lowercasePrompt.includes('diagram') || 
     lowercasePrompt.includes('map') || 
     lowercasePrompt.includes('topology') ||
     lowercasePrompt.includes('layout') ||
     lowercasePrompt.includes('infrastructure') ||
     lowercasePrompt.includes('architecture') ||
     lowercasePrompt.includes('visual') ||
     lowercasePrompt.includes('illustration'));
  
  if (hasNetworkHardwareKeyword || hasNetworkHardwareContext) {
    console.log('Network/hardware diagram request detected');
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
  
  // ONLY if this is a question, let's check if it EXPLICITLY asks for a visual
  if (isQuestion) {
    // If it's a question, it should explicitly ask for a visual
    const explicitlyAsksForVisual = 
      /(?:show|create|draw|generate|make|give|visualize|illustrate|display)\s+(?:me|us|a|an)?\s*(?:diagram|chart|visual|graph|picture|image|illustration|visualization|flow)/i.test(lowercasePrompt) ||
      /(?:can|could)\s+(?:you|i)\s+(?:show|see|have|get|create|make|draw)\s+(?:a|an)?\s*(?:diagram|visual|chart|graph|picture|image|illustration|visualization)/i.test(lowercasePrompt) ||
      /(?:i|we)\s+(?:want|need|would like)\s+(?:a|an|to see)?\s*(?:diagram|chart|visual|graph|picture|image|illustration|visualization)/i.test(lowercasePrompt) ||
      /(?:explain|describe|show)\s+(?:visually|with\s+a\s+diagram|with\s+an\s+image|with\s+a\s+picture|with\s+a\s+visual)/i.test(lowercasePrompt);
      
    if (!explicitlyAsksForVisual) {
      console.log('Question detected but does not explicitly ask for a visual');
      return false;
    }
  }
  
  // Check for domain-specific diagram requests (any type, not just OS migration)
  if (
    (lowercasePrompt.includes('migration') && lowercasePrompt.includes('diagram')) ||
    (lowercasePrompt.includes('rivermeadow') && (
      lowercasePrompt.includes('diagram') || 
      lowercasePrompt.includes('visual') || 
      lowercasePrompt.includes('picture') || 
      lowercasePrompt.includes('image'))
    )
  ) {
    console.log('Migration or RiverMeadow diagram request detected');
    return true;
  }
  
  // More focused detection for direct visual requests (expanded to include more terms)
  const containsVisualWords = 
    lowercasePrompt.includes('diagram') || 
    lowercasePrompt.includes('chart') || 
    lowercasePrompt.includes('graph') ||
    lowercasePrompt.includes('visualization') ||
    lowercasePrompt.includes('flowchart') ||
    lowercasePrompt.includes('architecture') ||
    lowercasePrompt.includes('picture') ||
    lowercasePrompt.includes('image') ||
    lowercasePrompt.includes('illustration') ||
    lowercasePrompt.includes('visual') ||
    lowercasePrompt.includes('infographic');
  
  if (!containsVisualWords) {
    return false;
  }
  
  // Additional check for action verbs specific to creating visuals (expanded list)
  const containsActionVerbs =
    lowercasePrompt.includes('create') ||
    lowercasePrompt.includes('draw') ||
    lowercasePrompt.includes('show') ||
    lowercasePrompt.includes('generate') ||
    lowercasePrompt.includes('visualize') ||
    lowercasePrompt.includes('make') ||
    lowercasePrompt.includes('design') ||
    lowercasePrompt.includes('illustrate') ||
    lowercasePrompt.includes('sketch') ||
    lowercasePrompt.includes('render') ||
    lowercasePrompt.includes('display') ||
    lowercasePrompt.includes('depict');
    
  if (containsActionVerbs && containsVisualWords) {
    console.log('Direct diagram request detected via keyword matching');
    return true;
  }
  
  // Default response based on combination of keywords with expanded visual terms
  const diagramScore = 
    // Primary diagram terms (higher weight)
    (lowercasePrompt.includes('flowchart') ? 2 : 0) +
    (lowercasePrompt.includes('diagram') ? 2 : 0) +
    (lowercasePrompt.includes('architecture') ? 2 : 0) +
    (lowercasePrompt.includes('chart') ? 2 : 0) +
    
    // Visual representation terms
    (lowercasePrompt.includes('picture') ? 1 : 0) +
    (lowercasePrompt.includes('image') ? 1 : 0) +
    (lowercasePrompt.includes('illustration') ? 1 : 0) +
    (lowercasePrompt.includes('visual') ? 1 : 0) +
    (lowercasePrompt.includes('graph') ? 1 : 0) +
    (lowercasePrompt.includes('visualization') ? 1 : 0) +
    (lowercasePrompt.includes('infographic') ? 1 : 0) +
    
    // Action verbs
    (lowercasePrompt.includes('visualize') ? 1 : 0) +
    (lowercasePrompt.includes('draw') ? 1 : 0) +
    (lowercasePrompt.includes('illustrate') ? 1 : 0) +
    (lowercasePrompt.includes('sketch') ? 1 : 0) +
    
    // Context boost
    (lowercasePrompt.includes('rivermeadow') ? 1 : 0) +
    (lowercasePrompt.includes('migration') ? 1 : 0);
  
  const isDiagramRequest = diagramScore >= 2;
  console.log(`Diagram detection score: ${diagramScore}, will ${isDiagramRequest ? '' : 'not '}generate diagram`);
  
  return isDiagramRequest;
};