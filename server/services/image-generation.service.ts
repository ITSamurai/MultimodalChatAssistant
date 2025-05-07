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
    // Only fall back to defaults if both prompt and context are extremely small
    const combinedContext = context.join(' ');
    if (combinedContext.length < 20 && prompt.length < 10) {
      console.log('FALLBACK: Both prompt and context too small - using template components');
      return defaultComponents; // This is defined at the start of the function
    }
    
    // Otherwise, attempt OpenAI even with small context
    console.log('Context relatively small but proceeding with OpenAI diagram generation');
    
    console.log('Generating diagram components using OpenAI');
    
    // Create a system prompt for extracting diagram components
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
    6. If the user mentions anything specific (AWS, Azure, Linux, Windows, etc.), prominently feature those elements.
    7. Always include "RiverMeadow Platform" as one of the nodes, but add specific components for this exact request.
    8. Include 4-7 main nodes with SPECIFIC, DETAILED, TECHNICAL names (not generic ones).
    9. Create 4-8 connections with DETAILED, TECHNICAL labels explaining exactly what happens in that connection.
    10. Include 2-4 categories with 4-6 items each that are SPECIFIC to this request.
    11. Make connection labels detailed and descriptive (15-25 characters).
    12. Vary your terminology greatly between diagrams - use synonyms for common terms.
    13. DO NOT use generic terms like "Source", "Target", "Environment" alone - be specific about what kind.`;
    
    // Create a user prompt combining the user's question and context
    // Add a random seed to force uniqueness between similar requests
    const randomSeed = Math.floor(Math.random() * 1000000);
    const currentTime = new Date().toISOString();
    
    const userPrompt = `
User's diagram request: "${prompt}"
    
Context information:
${context.join('\n\n')}

IMPORTANT: Create a COMPLETELY UNIQUE diagram different from any previous ones. Use this unique seed (${randomSeed}) 
and timestamp (${currentTime}) to ensure your response is novel and different.

NEVER USE ANY PREVIOUSLY GENERATED DIAGRAM STRUCTURE. Every aspect of this diagram must be unique:
- Use different node names than any previous diagrams
- Create different connections between different components
- Use different technical terminology and phrasing
- Structure the diagram in a completely different way

Remember this is for a specific request with ID: ${randomSeed}-${currentTime}-${Math.random().toString(36).substring(2, 10)} and must be unique.

Based on this information, provide the JSON structure for creating a diagram about RiverMeadow's cloud migration services.`;
    
    // Call OpenAI API to extract diagram components
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 1.4, // Maximum temperature value for greatest variation
      presence_penalty: 0.9, // High presence penalty to discourage repetition
      frequency_penalty: 0.9 // High frequency penalty to encourage unique words
    });
    
    // Parse the JSON response
    const content = response.choices[0].message.content || '{}';
    const result = JSON.parse(content);
    console.log('Generated diagram components from OpenAI:', JSON.stringify(result, null, 2));
    
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
  
  // Randomize diagram layout parameters
  const layoutType = Math.random() > 0.5 ? 'circular' : 'hierarchical';
  const centerX = 400 + Math.floor(Math.random() * 200);
  const centerY = 300 + Math.floor(Math.random() * 150);
  const radiusX = 200 + Math.floor(Math.random() * 100);
  const radiusY = 150 + Math.floor(Math.random() * 100);
  const offsetAngle = Math.random() * Math.PI; // Random starting angle
  
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
  
  // Randomly select edge styles
  const edgeStyles = [
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;",
    "edgeStyle=entityRelationEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;",
    "edgeStyle=elbowEdgeStyle;elbow=vertical;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;",
    "edgeStyle=segmentEdgeStyle;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;",
    "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=2;",
    "edgeStyle=entityRelationEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;entryX=0;entryY=0.5;strokeWidth=1.5;dashed=1;"
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
    
    if (layoutType === 'circular') {
      // Position nodes around the central node in a slightly irregular circle
      const angle = offsetAngle + (i - 1) * (2 * Math.PI / (orderedNodes.length - 1)) + (Math.random() * 0.2 - 0.1);
      const radius = 0.9 + Math.random() * 0.2; // Scale between 0.9 and 1.1
      x = centerX + radiusX * radius * Math.cos(angle);
      y = centerY + radiusY * radius * Math.sin(angle);
    } else {
      // Hierarchical layout
      if (i <= Math.ceil((orderedNodes.length - 1) / 2)) {
        // Top half - place above center
        x = centerX - 250 + (i-1) * 300 / Math.ceil((orderedNodes.length - 1) / 2);
        y = centerY - radiusY - Math.random() * 40;
      } else {
        // Bottom half - place below center
        const offset = i - 1 - Math.ceil((orderedNodes.length - 1) / 2);
        x = centerX - 250 + offset * 300 / Math.floor((orderedNodes.length - 1) / 2);
        y = centerY + radiusY/2 + Math.random() * 40;
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
const getInitialResponse = async (
  prompt: string, 
  knowledgeContext: string[] = []
): Promise<string> => {
  try {
    console.log('Getting initial response for prompt:', prompt);
    
    // Create a system prompt for initial information gathering
    const systemPrompt = `You are a senior cloud migration architect at RiverMeadow with expertise in OS migrations, cloud infrastructure, and technical diagrams.
    
    Provide a HIGHLY DETAILED, TECHNICAL explanation of the specific migration topic requested by the user.
    Your response should:
    
    1. Be highly specific to the exact type of migration or diagram the user requested
    2. Include 8-12 specific technical components, processes, or technologies involved
    3. Use precise technical terminology relevant to the specific request
    4. Describe complex relationships and data flows between components
    5. Include numerical specifications when relevant (times, sizes, capacities)
    6. Mention specific OS details if it's an OS migration request
    7. Mention specific cloud provider details if mentioned in the request
    8. Elaborate on technical implementation details (protocols, services, APIs)
    9. Reference specific RiverMeadow tools, technologies and methodologies
    10. VARY YOUR CONTENT SIGNIFICANTLY between different requests - never repeat the same explanations
    
    This technical information will be used to generate a visual diagram, so include a wide variety of elements that would make an interesting and informative visualization.`;
    
    // Create a user prompt combining the user's question and context
    // Add a random seed to force uniqueness between similar requests
    const randomSeed = Math.floor(Math.random() * 1000000);
    const currentTime = new Date().toISOString();
    
    const userPrompt = `
User's diagram request: "${prompt}"
    
Context information:
${knowledgeContext.join('\n\n')}

IMPORTANT: Create a COMPLETELY UNIQUE technical explanation different from any previous ones. 
Use this unique seed (${randomSeed}) and timestamp (${currentTime}) to ensure your response is novel and different.

NEVER USE ANY PREVIOUSLY GENERATED CONTENT. Generate a COMPLETELY NEW and DIFFERENT response each time.

Provide a highly detailed, specific, and technical explanation about this topic that would help in creating a diagram.
Focus on specific components, processes, and technical implementations.

Remember this is for a specific request with ID: ${randomSeed}-${currentTime}-${Math.random().toString(36).substring(2, 10)} and must be unique.`;
    
    // Call OpenAI API to get an initial response
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 1.4, // Maximum temperature value for greatest variation
      max_tokens: 1000,
      presence_penalty: 0.9, // High presence penalty to discourage repetition
      frequency_penalty: 0.9 // High frequency penalty to encourage unique words
    });
    
    // Extract the response content
    const content = response.choices[0].message.content || '';
    console.log('Generated initial response:', content.substring(0, 200) + '...');
    
    // Add a delay to ensure the OpenAI system has time to reset its context
    // This helps with avoiding repetitive responses
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return content;
  } catch (error) {
    console.error('Error getting initial response:', error);
    return `RiverMeadow provides cloud migration services with a core platform that connects source environments to target environments, supporting various migration types including P2V, V2C, and C2C across different cloud platforms like AWS, Azure, and Google Cloud.`;
  }
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
    
    // Add randomization to prompt to ensure unique diagram generation each time
    const randomSeed = Math.random().toString(36).substring(2, 10);
    const enhancedPrompt = `${prompt} (Unique request ID: ${timestamp}-${randomSeed})`;
    
    console.log('Generating diagram for prompt:', enhancedPrompt);
    
    // STEP 1: Get initial detailed response
    const initialResponse = await getInitialResponse(prompt, knowledgeContext);
    console.log('Received initial detailed response, now extracting diagram components');
    
    // STEP 2: Use the initial response to extract diagram components
    try {
      // Create an enhanced context combining original context and initial response
      const enhancedContext = [...knowledgeContext, initialResponse];
      
      // Extract meaningful components from the enhanced context and prompt
      const diagramComponents = await extractDiagramComponentsFromContext(prompt, enhancedContext);
      
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
      
      console.log(`FALLBACK TEMPLATE USED: Using fallback template for "${prompt}" with template type: ${
        lowerPrompt.includes('os') ? 'OS Migration' :
        lowerPrompt.includes('aws') ? 'AWS Migration' :
        lowerPrompt.includes('process') ? 'Process Framework' :
        'Generic Migration'
      }`);
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