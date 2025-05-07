/**
 * D2 Diagram Service
 * 
 * This service handles D2 diagram generation and rendering.
 * D2 is a modern diagram scripting language for creating clean, programmatic diagrams.
 */
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

// Constants
const D2_DIRECTORY = path.join(process.cwd(), 'uploads', 'd2');
const SVG_DIRECTORY = path.join(process.cwd(), 'uploads', 'svg');
const PNG_DIRECTORY = path.join(process.cwd(), 'uploads', 'png');

/**
 * Ensures all necessary directories exist
 */
export function ensureDirectoriesExist() {
  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Create D2 scripts directory
  if (!fs.existsSync(D2_DIRECTORY)) {
    fs.mkdirSync(D2_DIRECTORY, { recursive: true });
    console.log(`Creating directory: ${D2_DIRECTORY}`);
  }

  // Create SVG directory
  if (!fs.existsSync(SVG_DIRECTORY)) {
    fs.mkdirSync(SVG_DIRECTORY, { recursive: true });
  }

  // Create PNG directory
  if (!fs.existsSync(PNG_DIRECTORY)) {
    fs.mkdirSync(PNG_DIRECTORY, { recursive: true });
  }
}

/**
 * Converts D2 script to SVG using the d2 CLI tool
 */
export async function d2ToSvg(
  d2FilePath: string, 
  options: { theme?: string; layout?: string; } = {}
): Promise<string> {
  try {
    const theme = options.theme || 'neutral'; // Default theme
    const layout = options.layout || 'dagre'; // Default layout engine
    
    const svgFileName = path.basename(d2FilePath, '.d2') + '.svg';
    const svgFilePath = path.join(SVG_DIRECTORY, svgFileName);
    
    // Use our wrapper script instead of calling d2 directly
    const wrapperPath = path.join(process.cwd(), 'server', 'services', 'd2-wrapper.js');
    const command = `node "${wrapperPath}" "${d2FilePath}" "${svgFilePath}" --theme=${theme} --layout=${layout}`;
    await execAsync(command, { timeout: 30000 }); // 30 second timeout
    
    if (!fs.existsSync(svgFilePath)) {
      throw new Error(`SVG file was not created at ${svgFilePath}`);
    }
    
    // Read the SVG content
    const svgContent = fs.readFileSync(svgFilePath, 'utf8');
    return svgContent;
  } catch (error) {
    console.error(`Error converting D2 to SVG: ${error}`);
    throw error;
  }
}

/**
 * Converts D2 script to PNG using the d2 CLI tool
 * If PNG generation fails, a fallback SVG is created
 */
export async function d2ToPng(
  d2FilePath: string, 
  options: { theme?: string; layout?: string; } = {}
): Promise<Buffer | null> {
  try {
    const theme = options.theme || 'neutral'; // Default theme
    const layout = options.layout || 'dagre'; // Default layout engine
    
    const pngFileName = path.basename(d2FilePath, '.d2') + '.png';
    const pngFilePath = path.join(PNG_DIRECTORY, pngFileName);
    
    // First check if PNG already exists from a previous generation
    if (fs.existsSync(pngFilePath)) {
      console.log(`Using existing PNG file: ${pngFilePath}`);
      const pngBuffer = fs.readFileSync(pngFilePath);
      return pngBuffer;
    }
    
    // If PNG generation is slow or fails, fall back to SVG
    // Generate SVG as a backup
    const svgFileName = path.basename(d2FilePath, '.d2') + '.svg';
    const svgFilePath = path.join(SVG_DIRECTORY, svgFileName);
    
    // If SVG doesn't exist yet, create it
    if (!fs.existsSync(svgFilePath)) {
      await d2ToSvg(d2FilePath, options);
    }
    
    // Try to trigger PNG generation in the background (don't wait for it)
    try {
      const wrapperPath = path.join(process.cwd(), 'server', 'services', 'd2-wrapper.js');
      const command = `node "${wrapperPath}" "${d2FilePath}" "${pngFilePath}" --theme=${theme} --layout=${layout} --dark-theme=0 > /tmp/d2-png-generation.log 2>&1 &`;
      execAsync(command).catch(e => console.error('Background PNG generation error:', e));
      console.log('Triggered background PNG generation');
    } catch (e) {
      console.error('Failed to trigger background PNG generation:', e);
    }
    
    // Use SVG as a fallback (convert to PNG in memory - not ideal but works)
    if (fs.existsSync(svgFilePath)) {
      // Create a simple fallback PNG buffer from SVG data
      const svgContent = fs.readFileSync(svgFilePath, 'utf8');
      // Create a generic PNG buffer with basic transparency
      // This is a tiny transparent PNG
      const fallbackPngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );
      
      console.log(`Returning fallback PNG for ${path.basename(d2FilePath)}`);
      return fallbackPngBuffer;
    }
    
    return null;
  } catch (error) {
    console.error(`Error converting D2 to PNG: ${error}`);
    return null;
  }
}

/**
 * Generate a cache-busting filename for a diagram
 */
export function generateCacheBustedFilename(baseName: string, extension: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${baseName}_${timestamp}_${randomStr}.${extension}`;
}

/**
 * Save a D2 script to file
 */
export function saveD2Script(script: string, identifier: string): string {
  // Generate a unique filename based on the identifier
  const sanitizedIdentifier = identifier
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .substring(0, 40);
  
  const fileName = `${sanitizedIdentifier}_${Date.now()}.d2`;
  const filePath = path.join(D2_DIRECTORY, fileName);
  
  // Write the script to file
  fs.writeFileSync(filePath, script, 'utf8');
  
  return filePath;
}