/**
 * D2 Diagram Service
 * 
 * This service handles D2 diagram generation and rendering.
 * D2 is a modern diagram scripting language for creating clean, programmatic diagrams.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Define the paths for diagram storage
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const D2_DIR = path.join(UPLOADS_DIR, 'd2');
const SVG_DIR = path.join(UPLOADS_DIR, 'svg');
const PNG_DIR = path.join(UPLOADS_DIR, 'png');

/**
 * Ensures all necessary directories exist
 */
export function ensureDirectoriesExist() {
  const directories = [UPLOADS_DIR, D2_DIR, SVG_DIR, PNG_DIR];
  
  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Converts D2 script to SVG using the d2 CLI tool
 */
export async function d2ToSvg(
  d2Path: string
): Promise<string> {
  try {
    // Make sure the D2 file exists
    if (!fs.existsSync(d2Path)) {
      throw new Error(`D2 file not found: ${d2Path}`);
    }
    
    // Generate output path
    const baseName = path.basename(d2Path, path.extname(d2Path));
    const svgPath = path.join(SVG_DIR, `${baseName}.svg`);
    
    // Execute d2 command to generate SVG
    const command = `d2 "${d2Path}" "${svgPath}" --theme=3 --pad=30`;
    console.log(`Executing: ${command}`);
    
    await execAsync(command, { timeout: 10000 });
    
    // Check if the SVG was created
    if (!fs.existsSync(svgPath)) {
      throw new Error(`Failed to generate SVG. Output file not found: ${svgPath}`);
    }
    
    // Read the generated SVG content
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    
    return svgContent;
  } catch (error) {
    console.error('Error converting D2 to SVG:', error);
    
    // Create a fallback SVG with error message
    const errorSvg = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#fff0f0" />
        <text x="50%" y="40%" font-family="Arial" font-size="24" text-anchor="middle" fill="#cc0000">
          SVG Generation Error
        </text>
        <text x="50%" y="50%" font-family="Arial" font-size="16" text-anchor="middle" fill="#333">
          An error occurred while generating the SVG from D2
        </text>
        <text x="50%" y="60%" font-family="Arial" font-size="14" text-anchor="middle" fill="#666">
          File: ${path.basename(d2Path)}
        </text>
      </svg>
    `;
    
    // Save the error SVG as a fallback
    const baseName = path.basename(d2Path, path.extname(d2Path));
    const errorSvgPath = path.join(SVG_DIR, `${baseName}_error.svg`);
    fs.writeFileSync(errorSvgPath, errorSvg);
    
    throw new Error('Failed to convert D2 to SVG');
  }
}

/**
 * Converts D2 script to PNG using the d2 CLI tool
 */
export async function d2ToPng(
  d2Path: string
): Promise<Buffer | null> {
  try {
    // Make sure the D2 file exists
    if (!fs.existsSync(d2Path)) {
      return null;
    }
    
    // Generate output path
    const baseName = path.basename(d2Path, path.extname(d2Path));
    const pngPath = path.join(PNG_DIR, `${baseName}.png`);
    
    // Execute d2 command to generate PNG
    const command = `d2 "${d2Path}" "${pngPath}" --theme=3 --pad=30`;
    console.log(`Executing: ${command}`);
    
    await execAsync(command, { timeout: 10000 });
    
    // Check if the PNG was created
    if (!fs.existsSync(pngPath)) {
      return null;
    }
    
    // Read the generated PNG content
    return fs.readFileSync(pngPath);
  } catch (error) {
    console.error('Error converting D2 to PNG:', error);
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
 * Save a D2 script to file
 */
export function saveD2Script(script: string, identifier: string): string {
  const filename = `${identifier}_${Date.now()}.d2`;
  const filePath = path.join(D2_DIR, filename);
  
  // Ensure directory exists
  ensureDirectoriesExist();
  
  // Write the D2 script to file
  fs.writeFileSync(filePath, script);
  
  return filePath;
}