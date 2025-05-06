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
      temperature: 0.7
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
    
    try {
      // Extract meaningful components from the knowledge context and prompt
      const diagramComponents = await extractDiagramComponentsFromContext(prompt, knowledgeContext);
      
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