/**
 * Diagram Schema Service
 * 
 * This service handles the conversion of structured JSON metadata into D2 diagram format.
 * It implements the Diagram Schema Translator component of the architecture.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Define interfaces for the structured diagram data
export interface DiagramNode {
  id?: string;
  label: string;
  type?: string;
  style?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface DiagramConnection {
  from: string;
  to: string;
  label?: string;
  style?: string;
}

export interface DiagramCategory {
  [key: string]: string[];
}

export interface LayoutHints {
  direction?: 'TB' | 'BT' | 'LR' | 'RL';  // Top-bottom, Bottom-top, Left-right, Right-left
  spacing?: 'compact' | 'normal' | 'wide';
  style?: 'modern' | 'technical' | 'minimal' | 'colorful';
  emphasize?: string[];  // Node labels to emphasize
  group?: { [key: string]: string[] };  // Groups of nodes to visually cluster
}

export interface DiagramMetadata {
  title: string;
  nodes: string[] | DiagramNode[];
  connections: DiagramConnection[];
  categories?: DiagramCategory;
  description?: string;
  layoutHints?: LayoutHints;
}

// Default styling options
const DEFAULT_STYLES = {
  node: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;',
  connection: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;',
  title: 'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=16;fontStyle=1;',
  category: 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;whiteSpace=wrap;rounded=0;fontStyle=2;fontSize=12;',
  categoryItem: 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=10;',
};

// Constants for the XML template
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" modified="{{TIMESTAMP}}" agent="RiverMeadow Diagram Generator" version="{{VERSION}}">\n';
const XML_DIAGRAM_START = '  <diagram id="{{DIAGRAM_ID}}" name="{{DIAGRAM_NAME}}">\n    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" background="#ffffff">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n';
const XML_DIAGRAM_END = '      </root>\n    </mxGraphModel>\n  </diagram>\n';
const XML_FOOTER = '</mxfile>';

/**
 * Generates a unique ID for a diagram element
 */
function generateId(prefix: string = ''): string {
  return `${prefix}${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Sanitize text to be safe for XML
 */
function sanitizeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Creates a hash for a diagram prompt to use for caching
 */
export function createDiagramHash(prompt: string): string {
  return crypto.createHash('md5').update(prompt).digest('hex');
}

/**
 * Convert simple node strings to node objects with IDs
 */
function processNodes(nodes: string[] | DiagramNode[]): DiagramNode[] {
  const processedNodes: DiagramNode[] = [];
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (typeof node === 'string') {
      processedNodes.push({
        id: `node-${i}`,
        label: node,
        type: 'default'
      });
    } else {
      processedNodes.push({
        id: node.id || `node-${i}`,
        label: node.label,
        type: node.type || 'default',
        style: node.style,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      });
    }
  }
  
  return processedNodes;
}

/**
 * Convert connections to use node IDs
 */
function processConnections(connections: DiagramConnection[], nodes: DiagramNode[]): DiagramConnection[] {
  return connections.map((conn, i) => {
    // Find node IDs based on labels
    const sourceNode = nodes.find(n => n.label === conn.from);
    const targetNode = nodes.find(n => n.label === conn.to);
    
    if (!sourceNode || !targetNode) {
      console.warn(`Connection ${i} references non-existent nodes: ${conn.from} -> ${conn.to}`);
      return null;
    }
    
    return {
      from: sourceNode.id as string,
      to: targetNode.id as string,
      label: conn.label,
      style: conn.style || DEFAULT_STYLES.connection
    };
  }).filter(Boolean) as DiagramConnection[];
}

/**
 * Generate automatic layout for nodes
 */
function generateLayout(nodes: DiagramNode[]): DiagramNode[] {
  // Simple tree layout algorithm
  const nodeCount = nodes.length;
  const levels = Math.ceil(Math.sqrt(nodeCount));
  const nodesPerLevel = Math.ceil(nodeCount / levels);
  
  // Set position and size for each node
  return nodes.map((node, i) => {
    const level = Math.floor(i / nodesPerLevel);
    const position = i % nodesPerLevel;
    
    return {
      ...node,
      x: node.x || (position * 200 + 100),
      y: node.y || (level * 150 + 100),
      width: node.width || 120,
      height: node.height || 60
    };
  });
}

/**
 * Generate DrawIO XML for a node
 */
function generateNodeXml(node: DiagramNode): string {
  const style = node.style || DEFAULT_STYLES.node;
  
  return `        <mxCell id="${node.id}" value="${sanitizeXml(node.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry" />
        </mxCell>\n`;
}

/**
 * Generate DrawIO XML for a connection
 */
function generateConnectionXml(conn: DiagramConnection, index: number): string {
  const id = `edge-${index}`;
  const style = conn.style || DEFAULT_STYLES.connection;
  const label = conn.label ? `<mxCell id="${id}-label" value="${sanitizeXml(conn.label)}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];" vertex="1" connectable="0" parent="${id}">
          <mxGeometry x="-0.2" relative="1" as="geometry">
            <mxPoint as="offset" />
          </mxGeometry>
        </mxCell>` : '';
  
  return `        <mxCell id="${id}" style="${style}" edge="1" parent="1" source="${conn.from}" target="${conn.to}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        ${label}\n`;
}

/**
 * Generate DrawIO XML for the diagram title
 */
function generateTitleXml(title: string): string {
  const id = `title-${generateId()}`;
  
  return `        <mxCell id="${id}" value="${sanitizeXml(title)}" style="${DEFAULT_STYLES.title}" vertex="1" parent="1">
          <mxGeometry x="320" y="20" width="200" height="30" as="geometry" />
        </mxCell>\n`;
}

/**
 * Generate DrawIO XML for categories and their items
 */
function generateCategoriesXml(categories: DiagramCategory): string {
  if (!categories) return '';
  
  let xml = '';
  let y = 20;
  
  Object.entries(categories).forEach(([category, items], categoryIndex) => {
    // Category header
    const categoryId = `category-${categoryIndex}`;
    xml += `        <mxCell id="${categoryId}" value="${sanitizeXml(category)}" style="${DEFAULT_STYLES.category}" vertex="1" parent="1">
          <mxGeometry x="650" y="${y}" width="180" height="20" as="geometry" />
        </mxCell>\n`;
    
    y += 25;
    
    // Category items
    items.forEach((item, itemIndex) => {
      const itemId = `category-item-${categoryIndex}-${itemIndex}`;
      xml += `        <mxCell id="${itemId}" value="• ${sanitizeXml(item)}" style="${DEFAULT_STYLES.categoryItem}" vertex="1" parent="1">
          <mxGeometry x="660" y="${y}" width="170" height="20" as="geometry" />
        </mxCell>\n`;
      
      y += 20;
    });
    
    y += 15; // Add space between categories
  });
  
  return xml;
}

/**
 * Converts structured diagram metadata to D2 format
 */
export function convertJsonToD2(diagramData: DiagramMetadata): string {
  try {
    // Process nodes and connections to ensure proper IDs
    const processedNodes = processNodes(diagramData.nodes);
    
    // Start building the D2 script
    let d2 = `# ${diagramData.title}\n\n`;
    
    // Apply layout hints if available
    const layoutHints = diagramData.layoutHints || {};
    
    // Define direction based on layout hints or default to right
    const direction = layoutHints.direction ? layoutHints.direction.toLowerCase() : 'right';
    d2 += `direction: ${direction}\n`;
    
    // Apply spacing if specified via layout hints
    if (layoutHints.spacing) {
      let spacingValue = 1;
      switch (layoutHints.spacing) {
        case 'compact': spacingValue = 0.8; break;
        case 'normal': spacingValue = 1; break;
        case 'wide': spacingValue = 1.5; break;
      }
      // Use the D2 layout.rankSep parameter instead of spacing
      d2 += `# Custom spacing modifier for layout\n`;
      d2 += `@new_diagram: {\n`;
      d2 += `  layout: {\n`;
      d2 += `    rankSep: ${spacingValue * 50}\n`;  // Convert to a reasonable pixel value
      d2 += `  }\n`;
      d2 += `}\n`;
    }
    
    d2 += '\n';
    
    // Add description if provided
    if (diagramData.description) {
      d2 += `# Description: ${diagramData.description}\n\n`;
    }
    
    // Define nodes with styling based on layout hints
    processedNodes.forEach(node => {
      const sanitizedLabel = node.label.replace(/"/g, '\\"');
      
      // Determine node style based on layout hints style
      let fill = "#f5f5f5";
      let stroke = "#666666";
      let borderRadius = 4;
      let shape = "rectangle";
      
      if (layoutHints.style) {
        switch (layoutHints.style) {
          case 'modern':
            fill = "#f0f7ff";
            stroke = "#1890ff";
            borderRadius = 8;
            break;
          case 'technical':
            fill = "#f5f5f5";
            stroke = "#333333";
            borderRadius = 0;
            shape = "rectangle";
            break;
          case 'minimal':
            fill = "#ffffff";
            stroke = "#d9d9d9";
            borderRadius = 4;
            break;
          case 'colorful':
            // Use a hash of the node name to generate consistent colors
            const nodeHash = Math.abs(node.label.split('').reduce((a, b) => (a * 31 + b.charCodeAt(0)) | 0, 0));
            const hue = nodeHash % 360;
            fill = `hsl(${hue}, 80%, 95%)`;
            stroke = `hsl(${hue}, 70%, 60%)`;
            borderRadius = 6;
            break;
        }
      }
      
      // Check if this node should be emphasized
      if (layoutHints.emphasize && layoutHints.emphasize.includes(node.label)) {
        // Make emphasized nodes stand out
        stroke = "#ff4d4f";
        fill = "#fff2f0";
        borderRadius = 10;
        // Add a bold outline
        d2 += `${node.id}: "${sanitizedLabel}" {\n  shape: ${shape}\n  style: {\n    fill: "${fill}"\n    stroke: "${stroke}"\n    stroke-width: 2\n    border-radius: ${borderRadius}\n  }\n}\n\n`;
      } else {
        d2 += `${node.id}: "${sanitizedLabel}" {\n  shape: ${shape}\n  style: {\n    fill: "${fill}"\n    stroke: "${stroke}"\n    border-radius: ${borderRadius}\n  }\n}\n\n`;
      }
    });
    
    // Define connections
    const processedConnections = processConnections(diagramData.connections, processedNodes);
    processedConnections.forEach(conn => {
      let connectionStr = `${conn.from} -> ${conn.to}`;
      
      if (conn.label) {
        const sanitizedLabel = conn.label.replace(/"/g, '\\"');
        connectionStr += `: "${sanitizedLabel}"`;
      }
      
      d2 += `${connectionStr}\n`;
    });
    
    // Add visual grouping if specified in layout hints
    if (layoutHints.group) {
      d2 += '\n# Visual groups\n';
      
      Object.entries(layoutHints.group).forEach(([groupName, nodeLabels], groupIndex) => {
        if (nodeLabels && nodeLabels.length > 0) {
          // Find all node IDs that match the labels
          const nodeIds = processedNodes
            .filter(node => nodeLabels.includes(node.label))
            .map(node => node.id);
          
          if (nodeIds.length > 0) {
            // Create the container for these nodes
            const groupId = `group_${groupIndex}`;
            const sanitizedGroupName = groupName.replace(/"/g, '\\"');
            
            d2 += `\n${groupId}: "${sanitizedGroupName}" {\n`;
            d2 += `  style: {\n`;
            d2 += `    fill: "#fafafa"\n`;
            d2 += `    stroke: "#d9d9d9"\n`;
            d2 += `    stroke-dash: 3\n`;
            d2 += `    border-radius: 10\n`;
            d2 += `  }\n\n`;
            
            // List all nodes in this group
            nodeIds.forEach(nodeId => {
              d2 += `  ${nodeId}\n`;
            });
            
            d2 += `}\n`;
          }
        }
      });
    }
    
    // Add categories if provided
    if (diagramData.categories) {
      d2 += '\n# Categories\n';
      
      Object.entries(diagramData.categories).forEach(([category, items]) => {
        d2 += `\n# ${category}\n`;
        items.forEach(item => {
          d2 += `# - ${item}\n`;
        });
      });
    }
    
    return d2;
  } catch (error) {
    console.error('Error converting JSON to D2:', error);
    throw new Error('Failed to convert diagram metadata to D2 format');
  }
}

/**
 * Generates a fallback diagram in D2 format
 */
export function generateFallbackDiagram(title: string): string {
  // Create a simple diagram with a title and two nodes
  const diagramData: DiagramMetadata = {
    title: title || 'Fallback Diagram',
    nodes: ['Source', 'Destination'],
    connections: [{ from: 'Source', to: 'Destination', label: 'Connection' }]
  };
  
  return convertJsonToD2(diagramData);
}

/**
 * Save D2 diagram to a file
 */
export async function saveDiagramD2(d2Script: string, filename: string): Promise<string> {
  const uploadsDir = path.join(process.cwd(), 'uploads', 'd2');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  const filePath = path.join(uploadsDir, `${filename}.d2`);
  await fs.promises.writeFile(filePath, d2Script, 'utf8');
  
  return filePath;
}

/**
 * Load D2 diagram from a file
 */
export async function loadDiagramD2(filename: string): Promise<string | null> {
  const filePath = path.join(process.cwd(), 'uploads', 'd2', `${filename}.d2`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  return fs.promises.readFile(filePath, 'utf8');
}