/**
 * Simplified DrawIO Service
 * 
 * This service provides basic file handling for DrawIO XML files.
 * It implements a simplified version of the Render Engine component.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, XMLSerializer } from 'xmldom';

// Define the paths for diagram storage
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const GENERATED_DIR = path.join(UPLOADS_DIR, 'generated');
const SVG_DIR = path.join(UPLOADS_DIR, 'svg');
const PNG_DIR = path.join(UPLOADS_DIR, 'png');

/**
 * Ensures all necessary directories exist
 */
export function ensureDirectoriesExist() {
  const directories = [UPLOADS_DIR, GENERATED_DIR, SVG_DIR, PNG_DIR];
  
  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Creates a simple SVG from DrawIO XML
 * This is a simplified implementation that creates a basic SVG for demonstration purposes
 */
export async function drawioToSvg(
  xmlPath: string
): Promise<string> {
  try {
    // Read the DrawIO XML file
    const xmlContent = fs.readFileSync(xmlPath, 'utf8');
    
    // Parse the XML content
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Extract diagram components and convert to SVG
    // This is a very basic conversion - in a real implementation, 
    // this would use mxGraph to render the XML properly
    
    // Create a simple SVG representation
    const svgContent = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f8f8f8" />
        <text x="50%" y="30%" font-family="Arial" font-size="24" text-anchor="middle" fill="#333">
          RiverMeadow Diagram Renderer
        </text>
        <text x="50%" y="40%" font-family="Arial" font-size="16" text-anchor="middle" fill="#666">
          This is a simplified SVG representation of the diagram
        </text>
        <text x="50%" y="50%" font-family="Arial" font-size="14" text-anchor="middle" fill="#999">
          Original file: ${path.basename(xmlPath)}
        </text>
      </svg>
    `;
    
    // Determine output path
    const baseName = path.basename(xmlPath, path.extname(xmlPath));
    const svgPath = path.join(SVG_DIR, `${baseName}.svg`);
    
    // Save SVG file
    fs.writeFileSync(svgPath, svgContent);
    
    return svgContent;
  } catch (error) {
    console.error('Error converting DrawIO to SVG:', error);
    throw new Error('Failed to convert DrawIO to SVG');
  }
}

/**
 * Generates a PNG file from a DrawIO XML file
 * Simply copies the SVG file to a PNG location for demonstration purposes
 */
export async function drawioToPng(
  xmlPath: string
): Promise<Buffer | null> {
  try {
    // For simplicity, we'll return null to indicate PNG generation is not implemented
    // In a real implementation, this would use canvas or another library to render PNG
    return null;
  } catch (error) {
    console.error('Error converting DrawIO to PNG:', error);
    return null;
  }
}

/**
 * Generate a cache-busting filename for a diagram
 */
export function generateCacheBustedFilename(baseName: string, extension: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  return `${baseName}_${timestamp}_${randomId}.${extension}`;
}

/**
 * Helper function to extract a filename without extension
 */
export function getBaseFilename(filepath: string): string {
  return path.basename(filepath, path.extname(filepath));
}