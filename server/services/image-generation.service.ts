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
  // Default values for RiverMeadow diagram if context is insufficient
  const defaultComponents = {
    title: "RiverMeadow Cloud Migration Platform",
    nodes: ["RiverMeadow Platform", "Source Environment", "Target Environment", "Migration Process"],
    connections: [
      {from: "Source Environment", to: "RiverMeadow Platform"},
      {from: "RiverMeadow Platform", to: "Target Environment"},
      {from: "Migration Process", to: "RiverMeadow Platform"}
    ],
    categories: {
      "Migration Types": ["P2V", "V2C", "C2C", "Hardware Refresh"],
      "Cloud Platforms": ["AWS", "Azure", "Google Cloud", "VMware"]
    }
  };
  
  try {
    // If context is very small, just use default components
    const combinedContext = context.join(' ');
    if (combinedContext.length < 100) {
      console.log('Context too small, using default components');
      return defaultComponents;
    }
    
    console.log('Generating diagram components using OpenAI');
    
    // Create a system prompt for extracting diagram components
    const systemPrompt = `You are a diagram expert tasked with extracting key components from text to create a diagram about RiverMeadow's cloud migration services. 
    Format your response as a JSON object with the following structure exactly:
    {
      "title": "The main title for the diagram",
      "nodes": ["Node1", "Node2", "Node3", ...],
      "connections": [
        {"from": "Node1", "to": "Node2", "label": "optional connection label"},
        {"from": "Node2", "to": "Node3"}
      ],
      "categories": {
        "Category1": ["Item1", "Item2", "Item3"],
        "Category2": ["Item1", "Item2"]
      }
    }
    
    Important guidelines:
    1. Always include "RiverMeadow Platform" as one of the main nodes
    2. Focus on creating a technical system diagram showing components, relationships, and categories
    3. Use reasonable abbreviations for complex terms
    4. Extract ONLY real components mentioned in the provided context
    5. For the diagram title, make it specific to what the user is asking for
    6. Include 3-6 main nodes, 2-6 connections, and 2-4 categories with 3-6 items each
    7. DO NOT invent components that aren't mentioned in the context`;
    
    // Create a user prompt combining the user's question and context
    const userPrompt = `
User's diagram request: "${prompt}"
    
Context information:
${context.join('\n\n')}

Based on this information, provide the JSON structure for creating a diagram about RiverMeadow's cloud migration services.`;
    
    // Call OpenAI API to extract diagram components
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 1.0 // Increased temperature for more variation
    });
    
    // Parse the JSON response
    const content = response.choices[0].message.content || '{}';
    const result = JSON.parse(content);
    console.log('Generated diagram components from OpenAI:', JSON.stringify(result, null, 2));
    
    // Validate the structure
    if (!result.title || !Array.isArray(result.nodes) || !Array.isArray(result.connections) || !result.categories) {
      console.warn('Invalid structure in OpenAI response, using default components');
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
    console.log('Falling back to default components');
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
    const systemPrompt = `You are a cloud migration expert working at RiverMeadow. 
    Provide a detailed explanation of the topic requested. 
    Include specific details about components, processes, and relationships that would be useful for creating a technical diagram.
    Use technical terminology and be specific about how different parts connect.
    Focus on RiverMeadow-specific information when relevant.`;
    
    // Create a user prompt combining the user's question and context
    const userPrompt = `
User's diagram request: "${prompt}"
    
Context information:
${knowledgeContext.join('\n\n')}

Provide a detailed technical explanation about this topic that would help in creating a diagram.`;
    
    // Call OpenAI API to get an initial response
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 1.0, // Increased temperature for more variation
      max_tokens: 1000
    });
    
    // Extract the response content
    const content = response.choices[0].message.content || '';
    console.log('Generated initial response:', content.substring(0, 200) + '...');
    
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
    
    console.log('Generating diagram for prompt:', prompt);
    
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
      
      // Fall back to default components
      const defaultComponents = {
        title: "RiverMeadow Cloud Migration Platform",
        nodes: ["RiverMeadow Platform", "Source Environment", "Target Environment", "Migration Process"],
        connections: [
          {from: "Source Environment", to: "RiverMeadow Platform"},
          {from: "RiverMeadow Platform", to: "Target Environment"},
          {from: "Migration Process", to: "RiverMeadow Platform"}
        ],
        categories: {
          "Migration Types": ["P2V", "V2C", "C2C", "Hardware Refresh"],
          "Cloud Platforms": ["AWS", "Azure", "Google Cloud", "VMware"]
        }
      };
      
      // Generate Draw.io XML with default components
      const drawioXml = createDrawioXML(defaultComponents);
      
      // Save the Draw.io file
      const drawioPath = path.join(GENERATED_IMAGES_DIR, drawioFilename);
      await writeFile(drawioPath, drawioXml);
      
      console.log(`Diagram generated with defaults: ${drawioPath}`);
      
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