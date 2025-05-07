import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

// Define the SVG directory
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const SVG_DIR = path.join(UPLOADS_DIR, 'svg');

/**
 * Convert Draw.io XML to SVG
 * This is a simplified version that creates a representative SVG
 * instead of fully parsing the Draw.io XML
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
    
    // Parse the XML to extract diagram title
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Extract information from the diagram
    const diagramTitle = extractTitle(doc) || 'RiverMeadow Diagram';
    const diagramId = extractDiagramId(doc) || `diagram-${Date.now()}`;
    const components = extractComponentInfo(doc);
    
    // Create a unique SVG filename
    const svgFileName = `${path.basename(drawioFilePath, '.drawio')}.svg`;
    const svgFilePath = path.join(SVG_DIR, svgFileName);
    
    // Create an SVG representation of the diagram
    const svgContent = createVisualSvg(diagramTitle, diagramId, components);
    
    // Create SVG directory if it doesn't exist
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

/**
 * Extract basic component information from XML
 * This is a simplified version that extracts just enough info to create a preview
 */
function extractComponentInfo(doc: Document): { nodeCount: number, connectionCount: number } {
  try {
    // Count mxCell elements with vertex="1" as nodes
    const cells = doc.getElementsByTagName('mxCell');
    let nodeCount = 0;
    let connectionCount = 0;
    
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.getAttribute('vertex') === '1') {
        nodeCount++;
      } else if (cell.getAttribute('edge') === '1') {
        connectionCount++;
      }
    }
    
    return { nodeCount, connectionCount };
  } catch (error) {
    console.error('Error extracting component info:', error);
    return { nodeCount: 0, connectionCount: 0 };
  }
}

/**
 * Create an example visual representation of the diagram
 */
function createVisualSvg(title: string, diagramId: string, components: { nodeCount: number, connectionCount: number }): string {
  const width = 1100;
  const height = 850;
  const { nodeCount, connectionCount } = components;
  
  // Create a visually pleasing SVG
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- RiverMeadow Migration Diagram (ID: ${diagramId}) -->
  <style>
    text { font-family: Arial, sans-serif; }
    .title { font-size: 24px; font-weight: bold; }
    .subtitle { font-size: 14px; fill: #666; }
    .component { fill: #dae8fc; stroke: #6c8ebf; stroke-width: 2; }
    .connection { fill: #d5e8d4; stroke: #82b366; stroke-width: 1; }
    .info { font-size: 16px; fill: #333; }
    .warning { font-size: 14px; fill: #cc0000; }
  </style>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="#ffffff" />
  
  <!-- Title -->
  <text x="${width/2}" y="50" class="title" text-anchor="middle">${title}</text>
  
  <!-- Diagram representation -->
  <rect x="100" y="100" width="${width-200}" height="${height-250}" rx="10" ry="10" fill="#f9f9f9" stroke="#dddddd" stroke-width="1" />
  
  <!-- Component information -->
  <text x="${width/2}" y="180" class="info" text-anchor="middle">Diagram Components</text>
  <text x="${width/2}" y="220" class="info" text-anchor="middle">Nodes: ${nodeCount} | Connections: ${connectionCount}</text>
  
  <!-- Visual representation -->
  ${createSampleDiagramElements(width, height, nodeCount, connectionCount)}
  
  <!-- Warning -->
  <text x="${width/2}" y="${height-130}" class="warning" text-anchor="middle">⚠️ This is a preview. For full diagram interactivity,</text>
  <text x="${width/2}" y="${height-100}" class="warning" text-anchor="middle">download the .drawio file and open in draw.io</text>
  
  <!-- Footer with timestamp -->
  <text x="${width/2}" y="${height-40}" text-anchor="middle" font-size="12" fill="#999999">Generated: ${new Date().toISOString()}</text>
</svg>
  `;
}

/**
 * Create sample visual diagram elements based on component count
 */
function createSampleDiagramElements(width: number, height: number, nodeCount: number, connectionCount: number): string {
  let elements = '';
  const centerX = width / 2;
  const centerY = height / 2;
  const maxNodes = Math.min(nodeCount, 7); // Show at most 7 nodes in the preview
  
  // Create a central "RiverMeadow Platform" node
  elements += `
    <circle cx="${centerX}" cy="${centerY}" r="60" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2" />
    <text x="${centerX}" y="${centerY}" text-anchor="middle" font-size="14">RiverMeadow</text>
    <text x="${centerX}" y="${centerY + 20}" text-anchor="middle" font-size="14">Platform</text>
  `;
  
  // Create surrounding nodes
  if (maxNodes > 1) {
    const radius = 150;
    for (let i = 1; i < maxNodes; i++) {
      const angle = (i-1) * (2 * Math.PI / (maxNodes-1));
      const nodeX = centerX + radius * Math.cos(angle);
      const nodeY = centerY + radius * Math.sin(angle);
      
      // Add a smaller node
      elements += `
        <rect x="${nodeX-50}" y="${nodeY-25}" width="100" height="50" rx="10" ry="10" fill="#d5e8d4" stroke="#82b366" stroke-width="2" />
        <text x="${nodeX}" y="${nodeY + 5}" text-anchor="middle" font-size="12">Component ${i}</text>
      `;
      
      // Add connection line to central node
      elements += `
        <line x1="${centerX}" y1="${centerY}" x2="${nodeX}" y2="${nodeY}" stroke="#666666" stroke-width="1.5" stroke-dasharray="5,2" />
      `;
    }
  }
  
  return elements;
}

/**
 * Create an error SVG when things go wrong
 */
function createErrorSvg(errorMessage: string): string {
  return `
<svg width="500" height="300" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f8f8f8" />
  <text x="250" y="150" text-anchor="middle" font-size="16" fill="#cc0000">Error generating SVG</text>
  <text x="250" y="180" text-anchor="middle" font-size="14" fill="#cc0000">${errorMessage}</text>
</svg>
  `;
}