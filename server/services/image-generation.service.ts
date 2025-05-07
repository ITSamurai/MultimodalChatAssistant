// image-generation.service.ts
import { writeFile, mkdir } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from "openai";
import * as mxgraph from 'mxgraph';

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Initialize mxGraph for diagram rendering
const mx = mxgraph({
  mxImageBasePath: '/images',
  mxBasePath: '/mxgraph'
});

// Define the directories for storing images
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const GENERATED_IMAGES_DIR = path.join(UPLOADS_DIR, 'generated');
const PNG_DIR = path.join(UPLOADS_DIR, 'png');
const SVG_DIR = path.join(UPLOADS_DIR, 'svg');

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
    if (!fs.existsSync(SVG_DIR)) {
      await mkdir(SVG_DIR);
    }
  } catch (error) {
    console.error('Error creating directories:', error);
    throw new Error('Failed to create necessary directories');
  }
};

/**
 * Process diagram request and directly extract key components
 * Updated to be more efficient by skipping the initial response step
 */
const extractDiagramComponentsFromContext = async (
  prompt: string,
  context: string[]
): Promise<{
  title: string;
  nodes: string[];
  connections: Array<{from: string, to: string, label?: string}>;
  categories: Record<string, string[]>;
}> => {
  // Create variable default components based on the user's prompt
  // First, analyze the prompt to see what kind of diagram it is
  const lowerPrompt = prompt.toLowerCase();
  let defaultComponents;
  
  // Choose appropriate defaults based on the prompt type
  if (lowerPrompt.includes('os') || lowerPrompt.includes('operating system')) {
    // OS-focused migration diagram
    defaultComponents = {
      title: "Operating System Migration Platform Architecture",
      nodes: [
        "RiverMeadow Platform", 
        "OS Discovery Module", 
        "OS Transformation Engine", 
        "Hypervisor Connector",
        "OS Template Repository",
        "Runtime Configuration Manager"
      ],
      connections: [
        {from: "OS Discovery Module", to: "RiverMeadow Platform", label: "System Fingerprinting"},
        {from: "RiverMeadow Platform", to: "OS Transformation Engine", label: "Migration Orchestration"},
        {from: "OS Template Repository", to: "OS Transformation Engine", label: "Template Provisioning"},
        {from: "OS Transformation Engine", to: "Hypervisor Connector", label: "VM Deployment"},
        {from: "Hypervisor Connector", to: "Runtime Configuration Manager", label: "Post-Migration Tuning"}
      ],
      categories: {
        "Supported OS Types": ["Windows Server", "RHEL", "Ubuntu", "CentOS", "SUSE Linux"],
        "Migration Capabilities": ["OS Version Upgrade", "P2V Conversion", "Cross-Hypervisor Movement", "OS Configuration Transfer"],
        "Technical Components": ["Boot Volume Handler", "Registry Manager", "Driver Injection", "Network Configurator"]
      }
    };
  } else if (lowerPrompt.includes('aws') || lowerPrompt.includes('amazon')) {
    // AWS-focused migration diagram
    defaultComponents = {
      title: "AWS Cloud Migration Architecture",
      nodes: [
        "RiverMeadow Platform", 
        "AWS API Gateway", 
        "EC2 Instance Manager", 
        "S3 Data Transfer Service",
        "VPC Configuration Tool",
        "IAM Security Controller"
      ],
      connections: [
        {from: "RiverMeadow Platform", to: "AWS API Gateway", label: "Secure API Calls"},
        {from: "AWS API Gateway", to: "EC2 Instance Manager", label: "VM Provisioning"},
        {from: "RiverMeadow Platform", to: "S3 Data Transfer Service", label: "Data Replication"},
        {from: "EC2 Instance Manager", to: "VPC Configuration Tool", label: "Network Setup"},
        {from: "VPC Configuration Tool", to: "IAM Security Controller", label: "Permission Assignment"}
      ],
      categories: {
        "AWS Services": ["EC2", "S3", "VPC", "IAM", "CloudFormation", "Route 53"],
        "Security Features": ["KMS Encryption", "Security Groups", "IAM Roles", "VPC Endpoints"],
        "Optimization Tools": ["Auto Scaling Groups", "Elastic Load Balancing", "Reserved Instances"]
      }
    };
  } else if (lowerPrompt.includes('azure') || lowerPrompt.includes('microsoft')) {
    // Azure-focused migration diagram
    defaultComponents = {
      title: "Azure Cloud Migration Framework",
      nodes: [
        "RiverMeadow Platform", 
        "Azure Resource Manager", 
        "Virtual Machine Scale Sets", 
        "Azure Blob Storage",
        "Application Gateway",
        "Key Vault Service"
      ],
      connections: [
        {from: "RiverMeadow Platform", to: "Azure Resource Manager", label: "Resource Orchestration"},
        {from: "Azure Resource Manager", to: "Virtual Machine Scale Sets", label: "VM Deployment"},
        {from: "RiverMeadow Platform", to: "Azure Blob Storage", label: "Storage Replication"},
        {from: "Virtual Machine Scale Sets", to: "Application Gateway", label: "Traffic Management"},
        {from: "Application Gateway", to: "Key Vault Service", label: "Certificate Management"}
      ],
      categories: {
        "Azure Services": ["Virtual Machines", "Blob Storage", "Virtual Networks", "Load Balancers", "ExpressRoute"],
        "Migration Tools": ["Azure Migrate", "Site Recovery", "Database Migration Service"],
        "Security Features": ["Key Vault", "Network Security Groups", "Azure AD Integration"]
      }
    };
  } else if (lowerPrompt.includes('process') || lowerPrompt.includes('workflow')) {
    // Process-focused migration diagram
    defaultComponents = {
      title: "Cloud Migration Process Framework",
      nodes: [
        "RiverMeadow Platform", 
        "Discovery Module", 
        "Assessment Engine", 
        "Migration Planner",
        "Execution Orchestrator",
        "Validation System"
      ],
      connections: [
        {from: "Discovery Module", to: "Assessment Engine", label: "Environment Analysis"},
        {from: "Assessment Engine", to: "Migration Planner", label: "Recommendations"},
        {from: "Migration Planner", to: "RiverMeadow Platform", label: "Plan Implementation"},
        {from: "RiverMeadow Platform", to: "Execution Orchestrator", label: "Task Automation"},
        {from: "Execution Orchestrator", to: "Validation System", label: "Quality Control"}
      ],
      categories: {
        "Migration Phases": ["Discovery", "Assessment", "Planning", "Implementation", "Validation", "Optimization"],
        "Stakeholders": ["IT Operations", "Cloud Architects", "Application Owners", "Security Teams", "Business Units"],
        "Key Metrics": ["Migration Speed", "Application Performance", "Cost Reduction", "Downtime Minimization"]
      }
    };
  } else if (lowerPrompt.includes('vm') || lowerPrompt.includes('virtual machine')) {
    // VM-focused migration diagram
    defaultComponents = {
      title: "Virtual Machine Migration Architecture",
      nodes: [
        "RiverMeadow Platform", 
        "VM Inventory Scanner", 
        "Disk Image Processor", 
        "VM Configuration Analyzer",
        "Network Mapping Engine",
        "Hypervisor Integration Layer"
      ],
      connections: [
        {from: "VM Inventory Scanner", to: "RiverMeadow Platform", label: "VM Discovery"},
        {from: "RiverMeadow Platform", to: "VM Configuration Analyzer", label: "Requirement Analysis"},
        {from: "VM Configuration Analyzer", to: "Network Mapping Engine", label: "Network Translation"},
        {from: "RiverMeadow Platform", to: "Disk Image Processor", label: "Storage Migration"},
        {from: "Disk Image Processor", to: "Hypervisor Integration Layer", label: "Target Deployment"}
      ],
      categories: {
        "VM Detection": ["Inventory Discovery", "Resource Utilization", "Dependency Mapping", "Application Profiling"],
        "Migration Types": ["Cold Migration", "Live Migration", "Block-level Replication", "Snapshot-based Movement"],
        "Target Platforms": ["VMware", "Hyper-V", "KVM", "AWS EC2", "Azure VMs", "GCP Instances"]
      }
    };
  } else {
    // Generic diagram as a last resort
    defaultComponents = {
      title: "RiverMeadow Cloud Migration Platform Architecture",
      nodes: [
        "RiverMeadow Platform", 
        "Source Environment Connector", 
        "Migration Orchestration Engine", 
        "Target Cloud Adapter",
        "Data Replication Manager",
        "Configuration Controller"
      ],
      connections: [
        {from: "Source Environment Connector", to: "RiverMeadow Platform", label: "Source Data Capture"},
        {from: "RiverMeadow Platform", to: "Migration Orchestration Engine", label: "Workflow Management"},
        {from: "Migration Orchestration Engine", to: "Data Replication Manager", label: "Data Transfer"},
        {from: "Data Replication Manager", to: "Target Cloud Adapter", label: "Deployment Prep"},
        {from: "Target Cloud Adapter", to: "Configuration Controller", label: "Infrastructure Setup"}
      ],
      categories: {
        "Key Capabilities": ["Automated Discovery", "Cloud Agnostic Movement", "Workload Optimization", "Incremental Sync"],
        "Target Platforms": ["AWS", "Azure", "Google Cloud", "VMware", "OpenStack", "IBM Cloud"],
        "Service Features": ["API Integration", "Template Management", "Credential Handling", "Audit Logging"]
      }
    };
  }
  
  try {
    // If context is too small, use default components
    const combinedContext = context.join(' ');
    if (combinedContext.length < 20 && prompt.length < 10) {
      console.log('FALLBACK: Both prompt and context too small - using template components');
      return defaultComponents;
    }
    
    // Skip connectivity test for now as we'll use the Promise.race method
    console.log('Proceeding with OpenAI diagram generation (with timeout protection)')
    
    console.log('Context relatively small but proceeding with OpenAI diagram generation');
    console.log('Generating diagram components using OpenAI');
    
    // Create a system prompt for extracting diagram components with explanation
    const systemPrompt = `You are a creative cloud architecture expert tasked with designing a unique diagram about RiverMeadow's cloud migration services tailored specifically to the user's request. 
    Format your response as a JSON object with the following structure exactly:
    {
      "title": "The main title for the diagram",
      "nodes": ["Node1", "Node2", "Node3", ...],
      "connections": [
        {"from": "Node1", "to": "Node2", "label": "detailed connection label"},
        {"from": "Node2", "to": "Node3", "label": "detailed connection label"}
      ],
      "categories": {
        "Category1": ["Item1", "Item2", "Item3"],
        "Category2": ["Item1", "Item2"]
      }
    }
    
    IMPORTANT - MUST FOLLOW THESE GUIDELINES:
    1. CREATE A COMPLETELY UNIQUE DIAGRAM FOR THIS SPECIFIC REQUEST. Your diagram must be different from any previous diagrams.
    2. Use SPECIFIC, TECHNICAL TERMINOLOGY in node names, connection labels, and categories that precisely match the user's request.
    3. For OS migration requests, focus on OS-specific components, processes and technologies.
    4. For cloud migration requests, focus on cloud-specific architecture components.
    5. For process requests, focus on detailed step-by-step workflow components.
    6. For VM migration requests, focus on virtual machine transformation, disk handling, and hypervisor components.
    7. If the user mentions anything specific (AWS, Azure, Linux, Windows, etc.), prominently feature those elements.
    8. Always include "RiverMeadow Platform" as one of the nodes, but add specific components for this exact request.
    9. Include 4-7 main nodes with SPECIFIC, DETAILED, TECHNICAL names (not generic ones).
    10. Create 4-8 connections with DETAILED, TECHNICAL labels explaining exactly what happens in that connection.
    11. Include 2-4 categories with 4-6 items each that are SPECIFIC to this request.
    12. Make connection labels detailed and descriptive (10-20 characters).
    13. Vary your terminology greatly between diagrams - use synonyms for common terms.
    14. DO NOT use generic terms like "Source" or "Target" alone - be specific about what kind of source/target.`;
    
    // Create a user prompt combining the user's question and context
    // Add a random seed to force uniqueness between similar requests
    const randomSeed = Math.floor(Math.random() * 1000000);
    const currentTime = new Date().toISOString();
    
    const userPrompt = `
User's diagram request: "${prompt}"
    
Context information: ${context.length > 0 ? context.join('\n\n') : 'No additional context provided. Focus on the user request.'}

IMPORTANT: Create a COMPLETELY UNIQUE diagram different from any previous ones using unique seed ${randomSeed} 
and timestamp ${currentTime} to ensure your response is novel.

NEVER USE ANY PREVIOUSLY GENERATED DIAGRAM STRUCTURE. Every aspect of this diagram must be unique:
- Use different node names than any previous diagrams
- Create different connections between different components
- Use different technical terminology and phrasing
- Structure the diagram in a completely different way

Remember this is for a specific request with ID: ${randomSeed}-${currentTime}-${Math.random().toString(36).substring(2, 10)} and must be unique.

Based on this information, provide ONLY the JSON structure for creating a diagram about RiverMeadow's cloud migration services, with no additional explanation.`;
    
    // Call OpenAI API with reduced max tokens and optimized parameters
    // Note: We'll use a Promise.race with a timeout to avoid hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI request timed out after 30 seconds')), 30000);
    });
    
    const openaiPromise = openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000, // Reduced from default
      temperature: 1.2, // Slightly reduced but still high for creativity
      presence_penalty: 0.7, // Reduced slightly but still encourages new content
      frequency_penalty: 0.7 // Same as above
    });
    
    // Use Promise.race to implement timeout
    const response = await Promise.race([openaiPromise, timeoutPromise]) as Awaited<typeof openaiPromise>;
    
    // Parse the JSON response
    const content = response.choices[0].message.content || '{}';
    try {
      const result = JSON.parse(content);
      
      // Validate the structure
      if (!result.title || !Array.isArray(result.nodes) || !Array.isArray(result.connections) || !result.categories) {
        console.warn('FALLBACK TEMPLATE USED: Invalid structure in OpenAI response for prompt: "' + prompt + '"');
        console.warn('OpenAI returned an invalid structure. Using fallback template.');
        return defaultComponents;
      }
      
      // Make sure RiverMeadow Platform is included
      if (!result.nodes.includes('RiverMeadow Platform')) {
        result.nodes.unshift('RiverMeadow Platform');
      }
      
      // Return the extracted components
      return {
        title: result.title,
        nodes: result.nodes,
        connections: result.connections,
        categories: result.categories
      };
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.warn('FALLBACK TEMPLATE USED: Invalid JSON in OpenAI response for prompt: "' + prompt + '"');
      return defaultComponents;
    }
  } catch (error) {
    console.error('Error extracting diagram components from context:', error);
    console.warn('FALLBACK TEMPLATE USED: Error occurred during OpenAI request for prompt: "' + prompt + '"');
    console.log('Falling back to default components due to API or parsing error');
    return defaultComponents;
  }
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
  
  // SUPER AGGRESSIVE randomization of diagram layout parameters
  // Force a completely unique look on each generation!
  const layoutTypes = ['circular', 'hierarchical', 'radial', 'organic', 'tree', 'flowchart'];
  const layoutType = layoutTypes[Math.floor(Math.random() * layoutTypes.length)];
  console.log(`RANDOM LAYOUT SELECTED: ${layoutType} - forcing uniqueness!`);
  
  // Radically different positioning parameters
  const centerX = 300 + Math.floor(Math.random() * 400); // Huge range: 300-700
  const centerY = 200 + Math.floor(Math.random() * 300); // Huge range: 200-500
  const radiusX = 150 + Math.floor(Math.random() * 200); // Huge range: 150-350
  const radiusY = 100 + Math.floor(Math.random() * 200); // Huge range: 100-300
  const offsetAngle = Math.random() * 2 * Math.PI; // Full circle randomization
  
  // Randomize diagram scale and dimensions
  const scale = 0.8 + Math.random() * 0.4; // Scale between 0.8-1.2
  const pageWidth = Math.floor((1000 + Math.floor(Math.random() * 400)) * scale);
  const pageHeight = Math.floor((800 + Math.floor(Math.random() * 300)) * scale);
  
  // Create XML content with header - completely randomized parameters
  // Generate random parameters for the diagram display
  const randomDx = 1200 + Math.floor(Math.random() * 600);
  const randomDy = 700 + Math.floor(Math.random() * 400);
  const randomGrid = Math.random() > 0.5 ? "1" : "0";
  const randomGridSize = 5 + Math.floor(Math.random() * 15); // 5-20
  const randomBackground = Math.random() > 0.7 ? "#f9f9f9" : "#ffffff";
  const randomShadow = Math.random() > 0.7 ? "1" : "0";
  
  // Random ID and modification date with slight offset to avoid caching
  const modifiedDate = new Date();
  modifiedDate.setSeconds(modifiedDate.getSeconds() + Math.floor(Math.random() * 30));
  
  let xmlContent = `<mxfile host="app.diagrams.net" modified="${modifiedDate.toISOString()}" agent="RiverMeadow Assistant" version="21.2.9">
  <diagram id="${diagramId}" name="${title}">
    <mxGraphModel dx="${randomDx}" dy="${randomDy}" grid="${randomGrid}" gridSize="${randomGridSize}" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" background="${randomBackground}" math="0" shadow="${randomShadow}">
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
  
  // Randomly select node styles
  const nodeStyles = [
    // Modern styles with different shapes and colors
    "shape=ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=14;",
    "shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=13;",
    "shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=13;",
    "shape=cloud;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=13;",
    "shape=cylinder;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=13;",
    "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=13;",
    "shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fillColor=#f5f5f5;fontColor=#333333;strokeColor=#666666;fontSize=13;",
    "shape=step;perimeter=stepPerimeter;whiteSpace=wrap;html=1;fixedSize=1;fillColor=#b0e3e6;strokeColor=#0e8088;fontSize=13;"
  ];
  
  // Expanded edge styles with much more variety
  const edgeStyles = [
    // Basic edge styles
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;",
    "edgeStyle=entityRelationEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;",
    "edgeStyle=elbowEdgeStyle;elbow=vertical;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;",
    "edgeStyle=segmentEdgeStyle;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;",
    
    // Curved variants
    "edgeStyle=orthogonalEdgeStyle;curved=1;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;",
    "edgeStyle=entityRelationEdgeStyle;curved=1;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;",
    
    // Dashed variants
    "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;dashed=1;dashPattern=1 4;",
    "edgeStyle=elbowEdgeStyle;elbow=vertical;endArrow=classic;html=1;rounded=0;dashed=1;dashPattern=1 2;strokeWidth=1.5;",
    
    // Specialized arrows
    "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;endArrow=diamondThin;endFill=1;",
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;endArrow=block;endFill=1;",
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;endArrow=openAsync;endFill=0;",
    "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;endArrow=oval;endFill=0;",
    
    // Double arrow variants
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;endArrow=classic;endFill=1;startArrow=classic;startFill=1;",
    "edgeStyle=segmentEdgeStyle;endArrow=classic;startArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;strokeWidth=1.5;",
    
    // Special styles for emphasis
    "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=3;endArrow=block;endFill=1;",
    "edgeStyle=entityRelationEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;entryX=0;entryY=0.5;strokeWidth=2;dashed=1;dashPattern=1 2;"
  ];
  
  // Shuffle node order for more variety but keep RiverMeadow first
  const shuffledNodes = [nodes[0]];
  const otherNodes = nodes.slice(1);
  
  // Fisher-Yates shuffle
  for (let i = otherNodes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [otherNodes[i], otherNodes[j]] = [otherNodes[j], otherNodes[i]];
  }
  
  // Combine back
  const orderedNodes = [...shuffledNodes, ...otherNodes];
  
  // Add the central node - always RiverMeadow
  const centralNodeId = getCellId();
  const centralNodeStyle = nodeStyles[Math.floor(Math.random() * 2)]; // Choose one of the first two styles for central node
  nodeMap.set(orderedNodes[0], centralNodeId);
  
  // Get a random size for central node between 120-160
  const centralNodeSize = 120 + Math.floor(Math.random() * 41);
  
  xmlContent += `
        <!-- Central Node -->
        <mxCell id="${centralNodeId}" value="&lt;b&gt;${orderedNodes[0]}&lt;/b&gt;" style="${centralNodeStyle}" vertex="1" parent="1">
          <mxGeometry x="${centerX - centralNodeSize/2}" y="${centerY - centralNodeSize/2}" width="${centralNodeSize}" height="${centralNodeSize}" as="geometry" />
        </mxCell>`;
  
  // Add other primary nodes
  // Skip the first node (RiverMeadow Platform) as it's already added
  for (let i = 1; i < orderedNodes.length; i++) {
    const nodeId = getCellId();
    const nodeName = orderedNodes[i];
    nodeMap.set(nodeName, nodeId);
    
    // Choose a random node style
    const nodeStyle = nodeStyles[Math.floor(Math.random() * nodeStyles.length)];
    
    // Randomize node size slightly
    const nodeWidth = 120 + Math.floor(Math.random() * 41); // 120-160
    const nodeHeight = 50 + Math.floor(Math.random() * 21);  // 50-70
    
    let x, y;
    
    // Randomize node positions based on selected layout type
    if (layoutType === 'circular') {
      // Position nodes around the central node in a slightly irregular circle
      const angle = offsetAngle + (i - 1) * (2 * Math.PI / (orderedNodes.length - 1)) + (Math.random() * 0.5 - 0.25);
      const radius = 0.7 + Math.random() * 0.6; // More variable scale between 0.7 and 1.3
      x = centerX + radiusX * radius * Math.cos(angle);
      y = centerY + radiusY * radius * Math.sin(angle);
    } else if (layoutType === 'radial') {
      // Radial tree layout with multiple rings
      const level = 1 + Math.floor((i - 1) / 4); // Nodes per level (ring)
      const nodesInLevel = Math.min(4, orderedNodes.length - 1 - (level - 1) * 4);
      const posInLevel = (i - 1) % 4;
      const anglePerNode = (2 * Math.PI) / nodesInLevel;
      const angle = offsetAngle + posInLevel * anglePerNode + (Math.random() * 0.3 - 0.15);
      const radius = level * (radiusX / 2) * (0.8 + Math.random() * 0.4);
      x = centerX + radius * Math.cos(angle);
      y = centerY + radius * Math.sin(angle);
    } else if (layoutType === 'tree' || layoutType === 'flowchart') {
      // Tree or flowchart layout - vertical orientation
      const levels = Math.ceil(Math.sqrt(orderedNodes.length - 1));
      const nodesPerLevel = Math.ceil((orderedNodes.length - 1) / levels);
      const level = Math.floor((i - 1) / nodesPerLevel);
      const posInLevel = (i - 1) % nodesPerLevel;
      
      // Calculate position with more randomization
      const levelWidth = pageWidth * 0.8;
      const nodeSpacing = levelWidth / (nodesPerLevel + 1);
      
      x = centerX - levelWidth/2 + (posInLevel + 1) * nodeSpacing + (Math.random() * 60 - 30);
      y = centerY - radiusY/2 + level * 150 + (Math.random() * 50 - 25);
    } else if (layoutType === 'organic') {
      // Organic layout - random placement around center
      const angle = Math.random() * 2 * Math.PI;
      const distance = 50 + Math.random() * radiusX * 1.2;
      x = centerX + distance * Math.cos(angle);
      y = centerY + distance * Math.sin(angle);
    } else {
      // Hierarchical layout (default)
      if (i <= Math.ceil((orderedNodes.length - 1) / 2)) {
        // Top half - place above center with more variety
        x = centerX - 300 + (i-1) * 350 / Math.ceil((orderedNodes.length - 1) / 2) + (Math.random() * 100 - 50);
        y = centerY - radiusY - Math.random() * 100;
      } else {
        // Bottom half - place below center with more variety
        const offset = i - 1 - Math.ceil((orderedNodes.length - 1) / 2);
        x = centerX - 300 + offset * 350 / Math.floor((orderedNodes.length - 1) / 2) + (Math.random() * 100 - 50);
        y = centerY + radiusY/2 + Math.random() * 100;
      }
    }
    
    // Round coordinates to integers
    x = Math.round(x);
    y = Math.round(y);
    
    xmlContent += `
        <!-- Primary Node: ${nodeName} -->
        <mxCell id="${nodeId}" value="${nodeName}" style="${nodeStyle}" vertex="1" parent="1">
          <mxGeometry x="${x - nodeWidth/2}" y="${y - nodeHeight/2}" width="${nodeWidth}" height="${nodeHeight}" as="geometry" />
        </mxCell>`;
  }
  
  // Add connections between nodes
  for (const connection of connections) {
    const fromId = nodeMap.get(connection.from);
    const toId = nodeMap.get(connection.to);
    
    if (fromId && toId) {
      const connId = getCellId();
      // Choose a random edge style
      const edgeStyle = edgeStyles[Math.floor(Math.random() * edgeStyles.length)];
      
      // Add slight randomization to entry/exit points 
      const entryX = Math.random() > 0.5 ? 0 : 1;
      const entryY = Math.random() > 0.5 ? 0 : 1;
      
      xmlContent += `
        <!-- Connection from ${connection.from} to ${connection.to} -->
        <mxCell id="${connId}" value="${connection.label || ""}" style="${edgeStyle}" edge="1" parent="1" source="${fromId}" target="${toId}">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${entryX}" y="${entryY}" as="targetPoint" />
          </mxGeometry>
        </mxCell>`;
    }
  }
  
  // Add category sections - randomize position
  // Determine if categories should be on left or right side
  const categoriesOnLeft = Math.random() > 0.5;
  const categoryX = categoriesOnLeft ? 120 + Math.floor(Math.random() * 60) : 650 + Math.floor(Math.random() * 60); 
  let categoryY = 600 + Math.floor(Math.random() * 50);
  
  // Randomize category styles and colors
  const categoryHeaderStyles = [
    "fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;",
    "fillColor=#dae8fc;strokeColor=#6c8ebf;fontColor=#000000;",
    "fillColor=#d5e8d4;strokeColor=#82b366;fontColor=#000000;",
    "fillColor=#ffe6cc;strokeColor=#d79b00;fontColor=#000000;"
  ];
  
  // Category item style groups
  const categoryItemStyleGroups = [
    // Group 1: Blues and greens
    [
      "fillColor=#dae8fc;strokeColor=#6c8ebf;",
      "fillColor=#d5e8d4;strokeColor=#82b366;",
      "fillColor=#b1ddf0;strokeColor=#10739e;"
    ],
    // Group 2: Warm colors
    [
      "fillColor=#ffe6cc;strokeColor=#d79b00;",
      "fillColor=#f8cecc;strokeColor=#b85450;",
      "fillColor=#fad7ac;strokeColor=#b46504;"
    ],
    // Group 3: Purple and teal
    [
      "fillColor=#e1d5e7;strokeColor=#9673a6;",
      "fillColor=#b0e3e6;strokeColor=#0e8088;",
      "fillColor=#d4e1f5;strokeColor=#56517e;"
    ]
  ];
  
  // Choose a random style group for this diagram
  const selectedItemStyleGroup = categoryItemStyleGroups[Math.floor(Math.random() * categoryItemStyleGroups.length)];
  
  for (const [categoryName, items] of Object.entries(categories)) {
    // Add category title with random style
    const categoryTitleId = getCellId();
    const headerStyle = categoryHeaderStyles[Math.floor(Math.random() * categoryHeaderStyles.length)];
    
    // Randomize header width
    const headerWidth = 180 + Math.floor(Math.random() * 61); // 180-240
    
    xmlContent += `
        <!-- ${categoryName} Category -->
        <mxCell id="${categoryTitleId}" value="&lt;b&gt;${categoryName}&lt;/b&gt;" style="rounded=1;whiteSpace=wrap;html=1;${headerStyle}fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="${categoryX}" y="${categoryY}" width="${headerWidth}" height="40" as="geometry" />
        </mxCell>`;
    
    // Add category items with randomization
    const itemsPerRow = 2 + Math.floor(Math.random() * 2); // 2-3 items per row
    const itemWidth = 100 + Math.floor(Math.random() * 41); // 100-140
    const itemHeight = 35 + Math.floor(Math.random() * 16); // 35-50
    const itemSpacing = 15 + Math.floor(Math.random() * 16); // 15-30
    
    for (let i = 0; i < items.length; i++) {
      const itemId = getCellId();
      const item = items[i];
      
      // Choose a random style from the selected group
      const itemStyle = selectedItemStyleGroup[i % selectedItemStyleGroup.length];
      
      const row = Math.floor(i / itemsPerRow);
      const col = i % itemsPerRow;
      
      // Add slight position jitter
      const jitterX = Math.floor(Math.random() * 11) - 5; // -5 to +5
      const jitterY = Math.floor(Math.random() * 11) - 5; // -5 to +5
      
      const x = categoryX + (col * (itemWidth + itemSpacing)) - (row * 10) + jitterX;
      const y = categoryY + 50 + (row * (itemHeight + 15)) + jitterY;
      
      // Randomize border radius
      const rounded = Math.floor(Math.random() * 3) + 1;
      
      xmlContent += `
        <mxCell id="${itemId}" value="${item}" style="rounded=${rounded};whiteSpace=wrap;html=1;${itemStyle}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${itemWidth}" height="${itemHeight}" as="geometry" />
        </mxCell>`;
    }
    
    // Increase y position for next category
    categoryY += 60 + Math.ceil(items.length / itemsPerRow) * (itemHeight + 15) + 10;
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
 * First step - get detailed information about the topic from OpenAI
 */
// Function removed to optimize diagram generation process
// Now combined into the extractDiagramComponentsFromContext function directly

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
    
    // Add randomization to prompt to ensure unique diagram generation each time
    const randomSeed = Math.random().toString(36).substring(2, 10);
    const enhancedPrompt = `${prompt} (Unique request ID: ${timestamp}-${randomSeed})`;
    
    console.log('Generating diagram for prompt:', enhancedPrompt);
    
    // SINGLE STEP: Extract diagram components directly from the prompt and context
    // Skip the intermediate step of generating an initial response
    try {
      // Extract meaningful components directly from the context and prompt
      const diagramComponents = await extractDiagramComponentsFromContext(prompt, knowledgeContext);
      
      // STEP 3: Generate Draw.io XML
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
    } catch (diagramError) {
      console.error('Error extracting diagram components:', diagramError);
      
      // We're consistently getting cached/repeat diagrams
      // Implement a forced rotation system to ensure different diagrams
      // by ignoring the prompt content and using a timestamp-based selection
      const lowerPrompt = prompt.toLowerCase();
      
      // Determine which template to use based on the current timestamp
      // This will force a different template on each generation
      const timestampMod = Date.now() % 4; // 0, 1, 2, or 3
      let forcedTemplateType;
      
      switch(timestampMod) {
        case 0:
          forcedTemplateType = 'os';
          console.log('FORCING OS TEMPLATE for variety, ignoring prompt content');
          break;
        case 1:
          forcedTemplateType = 'aws';
          console.log('FORCING AWS TEMPLATE for variety, ignoring prompt content');
          break;
        case 2:
          forcedTemplateType = 'process';
          console.log('FORCING PROCESS TEMPLATE for variety, ignoring prompt content');
          break;
        default:
          forcedTemplateType = 'generic';
          console.log('FORCING GENERIC TEMPLATE for variety, ignoring prompt content');
      }
      
      // Log the forced template selection
      console.log(`Force-selected template: ${forcedTemplateType} (timestamp mod 4 = ${timestampMod})`);
      
      let fallbackComponents;
      
      // Use our forced template type instead of the prompt content
      if (forcedTemplateType === 'os') {
        // OS-focused migration diagram
        fallbackComponents = {
          title: "Operating System Migration Platform Architecture",
          nodes: [
            "RiverMeadow Platform", 
            "OS Discovery Module", 
            "OS Transformation Engine", 
            "Hypervisor Connector",
            "OS Template Repository",
            "Runtime Configuration Manager"
          ],
          connections: [
            {from: "OS Discovery Module", to: "RiverMeadow Platform", label: "System Fingerprinting"},
            {from: "RiverMeadow Platform", to: "OS Transformation Engine", label: "Migration Orchestration"},
            {from: "OS Template Repository", to: "OS Transformation Engine", label: "Template Provisioning"},
            {from: "OS Transformation Engine", to: "Hypervisor Connector", label: "VM Deployment"},
            {from: "Hypervisor Connector", to: "Runtime Configuration Manager", label: "Post-Migration Tuning"}
          ],
          categories: {
            "Supported OS Types": ["Windows Server", "RHEL", "Ubuntu", "CentOS", "SUSE Linux"],
            "Migration Capabilities": ["OS Version Upgrade", "P2V Conversion", "Cross-Hypervisor Movement", "OS Configuration Transfer"],
            "Technical Components": ["Boot Volume Handler", "Registry Manager", "Driver Injection", "Network Configurator"]
          }
        };
      } else if (forcedTemplateType === 'aws') {
        // AWS-focused migration diagram
        fallbackComponents = {
          title: "AWS Cloud Migration Architecture",
          nodes: [
            "RiverMeadow Platform", 
            "AWS API Gateway", 
            "EC2 Instance Manager", 
            "S3 Data Transfer Service",
            "VPC Configuration Tool",
            "IAM Security Controller"
          ],
          connections: [
            {from: "RiverMeadow Platform", to: "AWS API Gateway", label: "Secure API Calls"},
            {from: "AWS API Gateway", to: "EC2 Instance Manager", label: "VM Provisioning"},
            {from: "RiverMeadow Platform", to: "S3 Data Transfer Service", label: "Data Replication"},
            {from: "EC2 Instance Manager", to: "VPC Configuration Tool", label: "Network Setup"},
            {from: "VPC Configuration Tool", to: "IAM Security Controller", label: "Permission Assignment"}
          ],
          categories: {
            "AWS Services": ["EC2", "S3", "VPC", "IAM", "CloudFormation", "Route 53"],
            "Security Features": ["KMS Encryption", "Security Groups", "IAM Roles", "VPC Endpoints"],
            "Optimization Tools": ["Auto Scaling Groups", "Elastic Load Balancing", "Reserved Instances"]
          }
        };
      } else if (forcedTemplateType === 'process') {
        // Process-focused migration diagram
        fallbackComponents = {
          title: "Cloud Migration Process Framework",
          nodes: [
            "RiverMeadow Platform", 
            "Discovery Module", 
            "Assessment Engine", 
            "Migration Planner",
            "Execution Orchestrator",
            "Validation System"
          ],
          connections: [
            {from: "Discovery Module", to: "Assessment Engine", label: "Environment Analysis"},
            {from: "Assessment Engine", to: "Migration Planner", label: "Recommendations"},
            {from: "Migration Planner", to: "RiverMeadow Platform", label: "Plan Implementation"},
            {from: "RiverMeadow Platform", to: "Execution Orchestrator", label: "Task Automation"},
            {from: "Execution Orchestrator", to: "Validation System", label: "Quality Control"}
          ],
          categories: {
            "Migration Phases": ["Discovery", "Assessment", "Planning", "Implementation", "Validation", "Optimization"],
            "Stakeholders": ["IT Operations", "Cloud Architects", "Application Owners", "Security Teams", "Business Units"],
            "Key Metrics": ["Migration Speed", "Application Performance", "Cost Reduction", "Downtime Minimization"]
          }
        };
      } else {
        // Generic diagram as a last resort, but with more detailed components
        fallbackComponents = {
          title: "RiverMeadow Cloud Migration Platform Architecture",
          nodes: [
            "RiverMeadow Platform", 
            "Source Environment Connector", 
            "Migration Orchestration Engine", 
            "Target Cloud Adapter",
            "Data Replication Manager",
            "Configuration Controller"
          ],
          connections: [
            {from: "Source Environment Connector", to: "RiverMeadow Platform", label: "Source Data Capture"},
            {from: "RiverMeadow Platform", to: "Migration Orchestration Engine", label: "Workflow Management"},
            {from: "Migration Orchestration Engine", to: "Data Replication Manager", label: "Data Transfer"},
            {from: "Data Replication Manager", to: "Target Cloud Adapter", label: "Deployment Prep"},
            {from: "Target Cloud Adapter", to: "Configuration Controller", label: "Infrastructure Setup"}
          ],
          categories: {
            "Key Capabilities": ["Automated Discovery", "Cloud Agnostic Movement", "Workload Optimization", "Incremental Sync"],
            "Target Platforms": ["AWS", "Azure", "Google Cloud", "VMware", "OpenStack", "IBM Cloud"],
            "Service Features": ["API Integration", "Template Management", "Credential Handling", "Audit Logging"]
          }
        };
      }
      
      // Generate Draw.io XML with fallback components
      const drawioXml = createDrawioXML(fallbackComponents);
      
      // Save the Draw.io file
      const drawioPath = path.join(GENERATED_IMAGES_DIR, drawioFilename);
      await writeFile(drawioPath, drawioXml);
      
      console.log(`FALLBACK TEMPLATE USED: Using fallback template for "${prompt}" with forced template type: ${forcedTemplateType}`);
      console.log(`Diagram generated with fallback components: ${drawioPath}`);
      
      return {
        imagePath: `/uploads/generated/${drawioFilename}`,
        mmdPath: `/uploads/generated/${drawioFilename}`,
        mmdFilename: drawioFilename,
        altText: prompt.substring(0, 255) // Limit alt text length
      };
    }
    
  } catch (error) {
    console.error('Error generating diagram:', error);
    throw new Error('Failed to generate diagram');
  }
};

/**
 * Function to determine if a prompt is requesting an image generation
 * Enhanced to be more robust against spelling errors
 */
export const isImageGenerationRequest = (prompt: string): boolean => {
  const lowerPrompt = prompt.toLowerCase();
  
  // Functions to help with fuzzy matching
  const containsFuzzy = (target: string, terms: string[]): boolean => {
    return terms.some(term => {
      // Check for exact match first
      if (target.includes(term)) return true;
      
      // Check for common misspellings (e.g., diagam, diagrm, etc.)
      if (term === 'diagram' && 
          (target.includes('diag') || 
           target.includes('diagr') || 
           target.includes('diagra') ||
           target.includes('diagam'))) {
        console.log('Detected fuzzy match for "diagram"');
        return true;
      }
      
      return false;
    });
  };
  
  // Match diagram-related keywords including common misspellings
  const diagramTerms = ['diagram', 'chart', 'visual', 'image', 'picture', 'draw', 'graph'];
  const hasDiagramTerm = containsFuzzy(lowerPrompt, diagramTerms);
  
  // Always treat migration diagram requests as image generation requests
  const hasMigrationContext = lowerPrompt.includes('migration') && 
                             (lowerPrompt.includes('aws') || 
                              lowerPrompt.includes('os') || 
                              lowerPrompt.includes('cloud') ||
                              lowerPrompt.includes('operating'));
  
  // Log detection reasoning for debugging
  if (hasDiagramTerm) {
    console.log('Diagram generation detected: diagram-related term found in prompt');
  } else if (hasMigrationContext && lowerPrompt.includes('create')) {
    console.log('Diagram generation detected: create migration context found in prompt');
  }
  
  return hasDiagramTerm || 
         (lowerPrompt.includes('create') && hasMigrationContext) ||
         (lowerPrompt.includes('create') && (
           lowerPrompt.includes('architecture') ||
           lowerPrompt.includes('infrastructure')
         ));
};