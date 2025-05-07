import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';
import { v4 as uuidv4 } from 'uuid';

// Define the directories for storing files
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const GENERATED_DIR = path.join(UPLOADS_DIR, 'generated');
const SVG_DIR = path.join(UPLOADS_DIR, 'svg');
const PNG_DIR = path.join(UPLOADS_DIR, 'png');

// Ensure directories exist
export const ensureDirectoriesExist = async (): Promise<void> => {
  const dirs = [UPLOADS_DIR, GENERATED_DIR, SVG_DIR, PNG_DIR];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

/**
 * Convert Draw.io XML to SVG
 * This function parses the Draw.io XML file and generates an SVG representation
 */
export const drawioToSvg = async (drawioFilePath: string): Promise<string> => {
  try {
    console.log('Converting Draw.io file to SVG:', drawioFilePath);
    
    // Check if the file exists
    if (!fs.existsSync(drawioFilePath)) {
      console.error('Draw.io file not found:', drawioFilePath);
      return createErrorSvg('Draw.io file not found');
    }
    
    // Read the XML file
    const xmlContent = fs.readFileSync(drawioFilePath, 'utf-8');
    
    // Parse the XML to extract diagram information
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Extract information from the diagram
    const diagramTitle = extractTitle(doc) || path.basename(drawioFilePath);
    const diagramId = extractDiagramId(doc) || `diagram-${Date.now()}`;
    const { nodeCount, connectionCount, cells } = extractCells(doc);
    
    // Create a unique SVG filename
    const svgFileName = `${path.basename(drawioFilePath, '.drawio')}.svg`;
    const svgFilePath = path.join(SVG_DIR, svgFileName);
    
    // Create an SVG representation of the diagram
    const svgContent = createSvgFromCells(diagramTitle, diagramId, cells);
    
    // Ensure SVG directory exists
    if (!fs.existsSync(SVG_DIR)) {
      fs.mkdirSync(SVG_DIR, { recursive: true });
    }
    
    // Write the SVG file
    fs.writeFileSync(svgFilePath, svgContent);
    
    console.log(`SVG file generated successfully: ${svgFilePath}`);
    
    return svgContent;
  } catch (error) {
    console.error('Error converting Draw.io to SVG:', error);
    return createErrorSvg('Error generating SVG');
  }
};

/**
 * Extract diagram title from XML
 */
function extractTitle(doc: Document): string | null {
  try {
    const diagramElement = doc.getElementsByTagName('diagram')[0];
    if (diagramElement && diagramElement.getAttribute('name')) {
      return diagramElement.getAttribute('name');
    }
    return null;
  } catch (error) {
    console.error('Error extracting diagram title:', error);
    return null;
  }
}

/**
 * Extract diagram ID from XML
 */
function extractDiagramId(doc: Document): string | null {
  try {
    const diagramElement = doc.getElementsByTagName('diagram')[0];
    if (diagramElement && diagramElement.getAttribute('id')) {
      return diagramElement.getAttribute('id');
    }
    return null;
  } catch (error) {
    console.error('Error extracting diagram ID:', error);
    return null;
  }
}

interface Cell {
  id: string;
  type: 'node' | 'edge' | 'other';
  style: string;
  value: string;
  geometry: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  source?: string;
  target?: string;
}

/**
 * Extract cells from XML document
 */
function extractCells(doc: Document): { nodeCount: number, connectionCount: number, cells: Cell[] } {
  try {
    const cells = doc.getElementsByTagName('mxCell');
    let nodeCount = 0;
    let connectionCount = 0;
    const cellArray: Cell[] = [];
    
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const id = cell.getAttribute('id') || '';
      const style = cell.getAttribute('style') || '';
      const value = cell.getAttribute('value') || '';
      
      let type: 'node' | 'edge' | 'other' = 'other';
      
      if (cell.getAttribute('vertex') === '1') {
        type = 'node';
        nodeCount++;
      } else if (cell.getAttribute('edge') === '1') {
        type = 'edge';
        connectionCount++;
      }
      
      // Only process actual diagram elements (not the default 0 and 1 cells)
      if (id !== '0' && id !== '1') {
        // Extract geometry information
        const geometryElement = cell.getElementsByTagName('mxGeometry')[0];
        let geometry = null;
        
        if (geometryElement) {
          geometry = {
            x: parseFloat(geometryElement.getAttribute('x') || '0'),
            y: parseFloat(geometryElement.getAttribute('y') || '0'),
            width: parseFloat(geometryElement.getAttribute('width') || '0'),
            height: parseFloat(geometryElement.getAttribute('height') || '0')
          };
        }
        
        // Add the cell to our array
        cellArray.push({
          id,
          type,
          style,
          value,
          geometry,
          source: cell.getAttribute('source') || undefined,
          target: cell.getAttribute('target') || undefined
        });
      }
    }
    
    return { nodeCount, connectionCount, cells: cellArray };
  } catch (error) {
    console.error('Error extracting cells:', error);
    return { nodeCount: 0, connectionCount: 0, cells: [] };
  }
}

/**
 * Generate SVG from cells
 */
function createSvgFromCells(title: string, diagramId: string, cells: Cell[]): string {
  const width = 1100;
  const height = 850;
  
  // Extract only the nodes and edges
  const nodes = cells.filter(cell => cell.type === 'node');
  const edges = cells.filter(cell => cell.type === 'edge');
  
  // Begin SVG content
  let svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- RiverMeadow Migration Diagram (ID: ${diagramId}) -->
  <style>
    text { font-family: Arial, sans-serif; }
    .title { font-size: 24px; font-weight: bold; }
    .subtitle { font-size: 16px; fill: #666; }
    .node { fill: #dae8fc; stroke: #6c8ebf; stroke-width: 2; }
    .edge { stroke: #82b366; stroke-width: 2; marker-end: url(#arrowhead); }
    .node-label { font-size: 14px; fill: #333; }
    .footer { font-size: 12px; fill: #999; }
  </style>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="#ffffff" />
  
  <!-- Title -->
  <text x="${width/2}" y="40" class="title" text-anchor="middle">${title}</text>
  <text x="${width/2}" y="70" class="subtitle" text-anchor="middle">RiverMeadow Migration Diagram</text>
  
  <!-- Definitions -->
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#82b366" />
    </marker>
  </defs>
  
  <!-- Diagram content -->
  <g transform="translate(50, 100)">
`;
  
  // Add nodes
  for (const node of nodes) {
    if (node.geometry) {
      const { x, y, width: nodeWidth, height: nodeHeight } = node.geometry;
      // Scale the coordinates (drawing.io uses a large canvas)
      const scaleFactor = 0.7;
      const scaledX = x * scaleFactor;
      const scaledY = y * scaleFactor;
      const scaledWidth = nodeWidth * scaleFactor;
      const scaledHeight = nodeHeight * scaleFactor;
      
      // Determine fill color from style
      let fillColor = "#dae8fc";
      let strokeColor = "#6c8ebf";
      
      if (node.style.includes("fillColor=")) {
        const fillMatch = node.style.match(/fillColor=(#[0-9a-fA-F]{6})/);
        if (fillMatch) {
          fillColor = fillMatch[1];
        }
      }
      
      if (node.style.includes("strokeColor=")) {
        const strokeMatch = node.style.match(/strokeColor=(#[0-9a-fA-F]{6})/);
        if (strokeMatch) {
          strokeColor = strokeMatch[1];
        }
      }
      
      // Add the node rectangle
      svg += `
    <rect id="node-${node.id}" x="${scaledX}" y="${scaledY}" width="${scaledWidth}" height="${scaledHeight}" 
      rx="5" ry="5" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" />
    <text x="${scaledX + scaledWidth/2}" y="${scaledY + scaledHeight/2 + 5}" 
      class="node-label" text-anchor="middle">${node.value}</text>
`;
    }
  }
  
  // Add edges
  for (const edge of edges) {
    if (edge.source && edge.target) {
      // Find the source and target nodes
      const source = nodes.find(node => node.id === edge.source);
      const target = nodes.find(node => node.id === edge.target);
      
      if (source?.geometry && target?.geometry) {
        // Scale coordinates
        const scaleFactor = 0.7;
        const sourceX = source.geometry.x * scaleFactor + source.geometry.width * scaleFactor / 2;
        const sourceY = source.geometry.y * scaleFactor + source.geometry.height * scaleFactor / 2;
        const targetX = target.geometry.x * scaleFactor + target.geometry.width * scaleFactor / 2;
        const targetY = target.geometry.y * scaleFactor + target.geometry.height * scaleFactor / 2;
        
        // Determine edge color from style
        let edgeColor = "#82b366";
        
        if (edge.style.includes("strokeColor=")) {
          const strokeMatch = edge.style.match(/strokeColor=(#[0-9a-fA-F]{6})/);
          if (strokeMatch) {
            edgeColor = strokeMatch[1];
          }
        }
        
        // Add the edge line
        svg += `
    <line x1="${sourceX}" y1="${sourceY}" x2="${targetX}" y2="${targetY}" 
      stroke="${edgeColor}" stroke-width="2" marker-end="url(#arrowhead)" />
`;
      }
    }
  }
  
  // Close the diagram content group
  svg += `  </g>
  
  <!-- Footer -->
  <text x="${width/2}" y="${height - 20}" class="footer" text-anchor="middle">
    Generated: ${new Date().toISOString()}
  </text>
</svg>`;
  
  return svg;
}

/**
 * Create an error SVG when things go wrong
 */
function createErrorSvg(errorMessage: string): string {
  return `
<svg width="500" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#fff0f0" />
  <text x="250" y="120" text-anchor="middle" font-size="20" fill="#cc0000">Error Generating SVG</text>
  <text x="250" y="150" text-anchor="middle" font-size="16" fill="#666666">${errorMessage}</text>
  <text x="250" y="180" text-anchor="middle" font-size="14" fill="#666666">Please try again or contact support</text>
</svg>
  `;
}

/**
 * Save Draw.io XML to a file
 */
export const saveDiagramToFile = async (diagramXml: string): Promise<string> => {
  try {
    await ensureDirectoriesExist();
    
    // Generate a unique filename
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 6);
    const fileName = `diagram_${timestamp}-${uniqueId}.drawio`;
    const filePath = path.join(GENERATED_DIR, fileName);
    
    // Write the file
    fs.writeFileSync(filePath, diagramXml);
    
    console.log(`Diagram saved to: ${filePath}`);
    return fileName;
  } catch (error) {
    console.error('Error saving diagram to file:', error);
    throw new Error('Failed to save diagram file');
  }
};

/**
 * Convert Draw.io XML directly to PNG 
 * Note: This is a placeholder for future implementation
 */
export const drawioToPng = async (drawioFilePath: string): Promise<Buffer | null> => {
  // For now, this is a placeholder as direct PNG conversion requires puppeteer or similar
  console.log('PNG conversion requested for:', drawioFilePath);
  
  // In a real implementation, you might use puppeteer to render the diagram as PNG
  // For now, return null to indicate that direct PNG conversion is not implemented
  return null;
};