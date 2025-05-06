// image-generation.service.ts
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

/**
 * Ensure all necessary directories exist
 */
export const ensureDirectoriesExist = async (): Promise<void> => {
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
    throw new Error('Failed to create necessary directories');
  }
};

/**
 * Process the GPT response to extract key components for the diagram
 */
const extractDiagramComponentsFromContext = (context: string[]): {
  title: string;
  nodes: string[];
  connections: Array<{from: string, to: string, label?: string}>;
  categories: Record<string, string[]>;
} => {
  const combinedContext = context.join(' ');
  
  // Default values for RiverMeadow diagram if context is insufficient
  const defaultComponents = {
    title: "RiverMeadow Cloud Migration Platform",
    nodes: ["RiverMeadow Platform", "Source Environment", "Target Environment", "Migration Process"],
    connections: [
      {from: "Source Environment", to: "Migration Process"},
      {from: "Migration Process", to: "Target Environment"}
    ],
    categories: {
      "Migration Types": ["P2V", "V2C", "C2C", "Hardware Refresh"],
      "Cloud Platforms": ["AWS", "Azure", "Google Cloud", "VMware"]
    }
  };
  
  // Try to extract better components from the context
  if (combinedContext.length > 100) {
    const cloudPlatforms = ["AWS", "Azure", "Google Cloud", "VMware", "OpenShift", "IBM Cloud"]
      .filter(platform => combinedContext.includes(platform));
      
    const migrationTypes = [];
    if (combinedContext.includes("Physical to Virtual") || combinedContext.includes("P2V")) 
      migrationTypes.push("Physical to Virtual (P2V)");
    if (combinedContext.includes("Virtual to Cloud") || combinedContext.includes("V2C")) 
      migrationTypes.push("Virtual to Cloud (V2C)");
    if (combinedContext.includes("Cloud to Cloud") || combinedContext.includes("C2C")) 
      migrationTypes.push("Cloud to Cloud (C2C)");
    if (combinedContext.includes("Physical to Cloud") || combinedContext.includes("P2C")) 
      migrationTypes.push("Physical to Cloud (P2C)");
    
    const features = [];
    if (combinedContext.includes("data migration")) features.push("Data Migration");
    if (combinedContext.includes("live migration")) features.push("Live Migration");
    if (combinedContext.includes("non-intrusive")) features.push("Non-Intrusive Migration");
    if (combinedContext.includes("disaster recovery")) features.push("Disaster Recovery");
    if (combinedContext.includes("workload optimization")) features.push("Workload Optimization");
    
    return {
      title: "RiverMeadow Migration Solution",
      nodes: ["RiverMeadow Platform", "Source Infrastructure", "Target Cloud", "Migration Services"],
      connections: [
        {from: "Source Infrastructure", to: "RiverMeadow Platform", label: "Extract"},
        {from: "RiverMeadow Platform", to: "Target Cloud", label: "Deploy"},
        {from: "Migration Services", to: "RiverMeadow Platform", label: "Support"}
      ],
      categories: {
        "Migration Types": migrationTypes.length > 0 ? migrationTypes : defaultComponents.categories["Migration Types"],
        "Cloud Platforms": cloudPlatforms.length > 0 ? cloudPlatforms : defaultComponents.categories["Cloud Platforms"],
        "Features": features.length > 0 ? features : ["Automated Migration", "Secure Transfer", "Performance Optimization"]
      }
    };
  }
  
  return defaultComponents;
};

/**
 * Creates a Draw.io diagram XML with specified components
 */
const createDrawioXML = (components: {
  title: string;
  nodes: string[];
  connections: Array<{from: string, to: string, label?: string}>;
  categories: Record<string, string[]>;
}): string => {
  const {title, nodes, connections, categories} = components;
  
  // Generate unique ID for the diagram
  const diagramId = `diagram-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  
  // Create XML content with header
  let xmlContent = `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="RiverMeadow Assistant" version="21.2.9">
  <diagram id="${diagramId}" name="${title}">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="850" background="#ffffff" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />`;
  
  // Helper function to generate unique IDs for cells
  const getCellId = (() => {
    let counter = 2; // Start from 2 as 0 and 1 are reserved
    return () => counter++;
  })();
  
  // Map to store node IDs by name for creating connections
  const nodeMap = new Map<string, number>();
  
  // Add the central node - always RiverMeadow
  const centralNodeId = getCellId();
  nodeMap.set("RiverMeadow Platform", centralNodeId);
  
  xmlContent += `
        <!-- Central Node -->
        <mxCell id="${centralNodeId}" value="&lt;b&gt;${nodes[0]}&lt;/b&gt;" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="460" y="350" width="140" height="140" as="geometry" />
        </mxCell>`;
  
  // Add other primary nodes
  const primaryNodeStyles = [
    "rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;",
    "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;"
  ];
  
  // Skip the first node (RiverMeadow Platform) as it's already added
  for (let i = 1; i < nodes.length; i++) {
    const nodeId = getCellId();
    const nodeName = nodes[i];
    nodeMap.set(nodeName, nodeId);
    
    // Position nodes around the central node
    const angle = (i - 1) * (2 * Math.PI / (nodes.length - 1));
    const x = 460 + 250 * Math.cos(angle);
    const y = 350 + 200 * Math.sin(angle);
    
    xmlContent += `
        <!-- Primary Node: ${nodeName} -->
        <mxCell id="${nodeId}" value="${nodeName}" style="${primaryNodeStyles[i % primaryNodeStyles.length]}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="140" height="60" as="geometry" />
        </mxCell>`;
  }
  
  // Add connections between nodes
  for (const connection of connections) {
    const fromId = nodeMap.get(connection.from);
    const toId = nodeMap.get(connection.to);
    
    if (fromId && toId) {
      const connId = getCellId();
      xmlContent += `
        <!-- Connection from ${connection.from} to ${connection.to} -->
        <mxCell id="${connId}" value="${connection.label || ""}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" parent="1" source="${fromId}" target="${toId}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`;
    }
  }
  
  // Add category sections
  let categoryY = 600;
  
  for (const [categoryName, items] of Object.entries(categories)) {
    // Add category title
    const categoryTitleId = getCellId();
    xmlContent += `
        <!-- ${categoryName} Category -->
        <mxCell id="${categoryTitleId}" value="&lt;b&gt;${categoryName}&lt;/b&gt;" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="200" y="${categoryY}" width="200" height="40" as="geometry" />
        </mxCell>`;
    
    // Add category items
    const itemsPerRow = 3;
    const itemWidth = 120;
    const itemHeight = 40;
    const itemSpacing = 20;
    
    let colorIndex = 0;
    const categoryColors = [
      "fillColor=#e1d5e7;strokeColor=#9673a6;", // Purple
      "fillColor=#fff2cc;strokeColor=#d6b656;", // Yellow
      "fillColor=#f8cecc;strokeColor=#b85450;"  // Red
    ];
    
    for (let i = 0; i < items.length; i++) {
      const itemId = getCellId();
      const item = items[i];
      
      const row = Math.floor(i / itemsPerRow);
      const col = i % itemsPerRow;
      
      const x = 200 + col * (itemWidth + itemSpacing) - (row * 20); // Slight indent per row
      const y = categoryY + 50 + row * (itemHeight + 10);
      
      xmlContent += `
        <mxCell id="${itemId}" value="${item}" style="rounded=1;whiteSpace=wrap;html=1;${categoryColors[colorIndex]}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${itemWidth}" height="${itemHeight}" as="geometry" />
        </mxCell>`;
    }
    
    categoryY += 50 + Math.ceil(items.length / itemsPerRow) * (itemHeight + 10) + 30;
    colorIndex = (colorIndex + 1) % categoryColors.length;
  }
  
  // Close XML structure
  xmlContent += `
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
  
  return xmlContent;
};

/**
 * Main function to generate a diagram based on a prompt and knowledge context
 */
export const generateDiagram = async (
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
    
    // Generate a unique filename with timestamp and random string
    const timestamp = Date.now();
    const uniqueId = `${timestamp}-${Math.random().toString(36).substring(2, 8)}`;
    const drawioFilename = `diagram_${uniqueId}.drawio`;
    
    console.log('Generating diagram for prompt:', prompt);
    
    // Extract meaningful components from the knowledge context
    const diagramComponents = extractDiagramComponentsFromContext(knowledgeContext);
    
    // If the prompt contains specific keywords, modify the default diagram
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes('migration')) {
      diagramComponents.title = "RiverMeadow Migration Process";
      // Enhance with migration-specific content
      diagramComponents.categories["Migration Steps"] = [
        "Discovery", "Assessment", "Planning", "Migration", "Validation", "Cutover"
      ];
    } else if (lowerPrompt.includes('disaster recovery') || lowerPrompt.includes('dr')) {
      diagramComponents.title = "RiverMeadow Disaster Recovery Solution";
      // Enhance with DR-specific content
      diagramComponents.categories["Recovery Components"] = [
        "Backup", "Replication", "Failover", "Failback", "Testing"
      ];
    } else if (lowerPrompt.includes('architecture')) {
      diagramComponents.title = "RiverMeadow System Architecture";
      // Enhance with architecture-specific content
      diagramComponents.categories["System Components"] = [
        "Control Plane", "Data Plane", "API Gateway", "Authentication", "Scheduling Engine"
      ];
    }
    
    // Generate Draw.io XML
    const drawioXml = createDrawioXML(diagramComponents);
    
    // Save the Draw.io file
    const drawioPath = path.join(GENERATED_IMAGES_DIR, drawioFilename);
    await writeFile(drawioPath, drawioXml);
    
    console.log(`Diagram generated successfully: ${drawioPath}`);
    
    return {
      imagePath: `/uploads/generated/${drawioFilename}`,
      mmdPath: `/uploads/generated/${drawioFilename}`,
      mmdFilename: drawioFilename,
      altText: prompt.substring(0, 255) // Limit alt text length
    };
  } catch (error) {
    console.error('Error generating diagram:', error);
    throw new Error('Failed to generate diagram');
  }
};

/**
 * Function to determine if a prompt is requesting an image generation
 */
export const isImageGenerationRequest = (prompt: string): boolean => {
  const lowerPrompt = prompt.toLowerCase();
  
  // Match diagram-related keywords
  return lowerPrompt.includes('diagram') || 
         lowerPrompt.includes('chart') || 
         lowerPrompt.includes('visual') ||
         lowerPrompt.includes('image') ||
         lowerPrompt.includes('picture') ||
         lowerPrompt.includes('draw') ||
         lowerPrompt.includes('create') && (
           lowerPrompt.includes('migration') ||
           lowerPrompt.includes('architecture') ||
           lowerPrompt.includes('infrastructure')
         );
};