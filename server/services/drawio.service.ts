/**
 * DrawIO Service
 * 
 * This service handles the conversion of DrawIO XML to SVG and PNG formats.
 * It implements the Render Engine component of the architecture.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';
import * as crypto from 'crypto';

// Mock MxGraph for testing - in production we would use the actual library
// This is a simplified mock for demonstration purposes
const mxgraph = function() {
  return {
    mxConstants: {},
    mxCodec: function() {
      return {
        decode: () => ({ root: { children: [] } })
      };
    },
    mxUtils: {},
    mxClient: {
      NO_FO: false
    },
    mxImageExport: function() {
      return {
        drawState: () => {}
      };
    },
    mxXmlCanvas2D: function() {
      return {};
    },
    mxGraph: function() {
      return {
        resetViewOnRootChange: true,
        setConnectable: () => {},
        gridEnabled: false,
        setEnabled: () => {},
        getModel: () => ({
          beginUpdate: () => {},
          endUpdate: () => {}
        }),
        addCells: () => {},
        getGraphBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
        getView: () => ({
          getState: () => ({})
        })
      };
    }
  };
};

// Create directories for rendered diagrams
export function ensureDirectoriesExist() {
  const dirs = ['uploads', 'uploads/svg', 'uploads/png', 'uploads/generated'];
  
  for (const dir of dirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

// Initialize mxGraph
const mxGraphFactory = mxgraph({
  mxImageBasePath: 'images',
  mxBasePath: 'javascript',
  mxLoadResources: false,
  mxLoadStylesheets: false,
});

// Create the necessary mxGraph components
const mxConstants = mxGraphFactory.mxConstants;
const mxCodec = mxGraphFactory.mxCodec;
const mxUtils = mxGraphFactory.mxUtils;
const mxClient = mxGraphFactory.mxClient;
const mxImageExport = mxGraphFactory.mxImageExport;
const mxXmlCanvas2D = mxGraphFactory.mxXmlCanvas2D;

/**
 * Generates an SVG file from a DrawIO XML file
 */
export async function drawioToSvg(
  xmlFilePath: string, 
  outputFilePath?: string
): Promise<string> {
  try {
    // Ensure directories exist
    ensureDirectoriesExist();
    
    // Read the DrawIO XML file
    const xmlContent = fs.readFileSync(xmlFilePath, 'utf8');
    
    // Parse the XML
    const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
    
    // Get the diagram tag
    const diagramNodes = doc.getElementsByTagName('diagram');
    if (diagramNodes.length === 0) {
      throw new Error('No diagram found in the DrawIO file');
    }
    
    // Get the mxGraphModel content
    const diagramNode = diagramNodes[0];
    const encodedContent = diagramNode.textContent?.trim();
    
    if (!encodedContent) {
      throw new Error('Empty diagram content');
    }
    
    let graphModelXml;
    // Check if the content is encoded or plain XML
    if (encodedContent.startsWith('<mxGraphModel')) {
      graphModelXml = encodedContent;
    } else {
      // It might be encoded (e.g., with deflate + base64)
      // In a real implementation, we'd decode it, but for simplicity we'll assume plain XML
      graphModelXml = encodedContent;
    }
    
    // Parse the mxGraphModel content
    const graphModelDoc = new DOMParser().parseFromString(graphModelXml, 'text/xml');
    
    // Create an SVG document
    const svgDoc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" version="1.1"></svg>', 'text/xml');
    
    // Create a codec and decode the model
    const codec = new mxCodec(graphModelDoc);
    const model = codec.decode(graphModelDoc.documentElement);
    
    // Create a graph instance
    const graph = new mxGraphFactory.mxGraph();
    
    // Configure the graph
    graph.resetViewOnRootChange = false;
    graph.setConnectable(false);
    graph.gridEnabled = false;
    graph.setEnabled(false);
    
    // Import the model
    const importCells = model.root.children; 
    graph.getModel().beginUpdate();
    try {
      graph.addCells(importCells);
    } finally {
      graph.getModel().endUpdate();
    }
    
    // Configure the background
    const container = document.createElement('div');
    container.style.background = '#ffffff';
    container.style.borderRadius = '10px';
    mxClient.NO_FO = true;
    
    // Get the bounds of all cells
    const graphBounds = graph.getGraphBounds();
    const svgNode = svgDoc.documentElement;
    
    // Set the SVG dimensions with some padding
    const padding = 10;
    svgNode.setAttribute('width', String(graphBounds.width + 2 * padding));
    svgNode.setAttribute('height', String(graphBounds.height + 2 * padding));
    svgNode.setAttribute('viewBox', `${graphBounds.x - padding} ${graphBounds.y - padding} ${graphBounds.width + 2 * padding} ${graphBounds.height + 2 * padding}`);
    
    // Export to SVG
    const svgCanvas = new mxXmlCanvas2D(svgNode);
    const imgExport = new mxImageExport();
    imgExport.drawState(graph.getView().getState(graph.getModel().getRoot()), svgCanvas);
    
    // Convert SVG document to string
    const svgContent = new XMLSerializer().serializeToString(svgDoc);
    
    // Determine output path if not provided
    if (!outputFilePath) {
      const filename = path.basename(xmlFilePath, '.drawio');
      outputFilePath = path.join(process.cwd(), 'uploads', 'svg', `${filename}.svg`);
    }
    
    // Write SVG to file
    fs.writeFileSync(outputFilePath, svgContent, 'utf8');
    
    return outputFilePath;
  } catch (error) {
    console.error('Error converting DrawIO to SVG:', error);
    throw new Error('Failed to convert DrawIO diagram to SVG');
  }
}

/**
 * Generates a PNG file from a DrawIO XML file
 * Note: This is a simplified implementation that just copies the SVG file for now
 * In a production environment, we would use a proper SVG-to-PNG conversion tool
 */
export async function drawioToPng(
  xmlFilePath: string, 
  outputFilePath?: string
): Promise<string> {
  try {
    // Ensure directories exist
    ensureDirectoriesExist();
    
    // For now, we'll just use the SVG file since we don't have a proper SVG-to-PNG conversion
    // In a real implementation, you would use a library like sharp or a service like puppeteer
    const svgPath = await drawioToSvg(xmlFilePath);
    
    // Determine output path if not provided
    if (!outputFilePath) {
      const filename = path.basename(xmlFilePath, '.drawio');
      outputFilePath = path.join(process.cwd(), 'uploads', 'png', `${filename}.png`);
    }
    
    // Instead of true conversion, we'll just copy the SVG file to a PNG location
    // This is only for demonstration purposes
    fs.copyFileSync(svgPath, outputFilePath);
    
    return outputFilePath;
  } catch (error) {
    console.error('Error creating PNG file:', error);
    throw new Error('Failed to create PNG version of diagram');
  }
}

/**
 * Generate a cache-busting filename for a diagram
 */
export function generateCacheBustedFilename(baseName: string, extension: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(3).toString('hex');
  return `${baseName}-${timestamp}-${random}.${extension}`;
}

/**
 * Helper function to extract a filename without extension
 */
export function getBaseFilename(filepath: string): string {
  return path.basename(filepath, path.extname(filepath));
}