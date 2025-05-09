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
 * Converts D2 script to SVG using the d2 CLI tool with configuration options
 */
export async function d2ToSvg(
  d2FilePath: string, 
  options: { 
    theme?: number; 
    darkTheme?: number;
    layout?: string;
    sketchMode?: boolean;
    pad?: number;
    containerBgColor?: string;
  } = {}
): Promise<string> {
  try {
    // Get configuration or use defaults
    const theme = options.theme !== undefined ? options.theme : 0;
    const darkTheme = options.darkTheme !== undefined ? options.darkTheme : -1;
    const layout = options.layout || "dagre";
    const sketchMode = options.sketchMode === true;
    const pad = options.pad !== undefined ? options.pad : 20; // Use a smaller default padding
    
    const svgFileName = path.basename(d2FilePath, '.d2') + '.svg';
    const svgFilePath = path.join(SVG_DIRECTORY, svgFileName);
    
    // Check if D2 is installed directly first
    const d2PathCheck = await execAsync('which d2').catch(() => null);
    const d2Path = d2PathCheck?.stdout?.trim() || '/nix/store/yzym5q8ib2xqp4nr7s7ggk3alsibwg7a-d2-0.6.5/bin/d2';
    console.log(`Found D2 at path: ${d2Path}`);
    
    // Check if D2 is executable
    await execAsync(`test -x "${d2Path}"`).catch(e => {
      console.error(`D2 is not executable: ${e.message}`);
    });
    
    // For debugging
    console.log(`Attempting to use D2 directly: ${d2Path} "${d2FilePath}" "${svgFilePath}"`);
    
    // Attempt to run D2 directly first
    try {
      await execAsync(`"${d2Path}" "${d2FilePath}" "${svgFilePath}" --theme=${theme} --layout=${layout} --pad=${pad}`, { timeout: 10000 });
      console.log('D2 direct execution successful');
      
      if (fs.existsSync(svgFilePath)) {
        console.log(`SVG file created successfully by direct D2 execution at: ${svgFilePath}`);
        const svgContent = fs.readFileSync(svgFilePath, 'utf8');
        return svgContent;
      }
    } catch (error) {
      const directError = error as Error;
      console.error(`Failed to run D2 directly: ${directError.message}`);
    }
    
    // Fallback to wrapper script
    const wrapperPath = path.join(process.cwd(), 'server', 'services', 'd2-wrapper.js');
    // Make sure the script has execute permissions
    await execAsync(`chmod +x "${wrapperPath}"`).catch(e => console.error(`Failed to chmod wrapper: ${e}`));
    
    // Pass configuration options to the wrapper script
    const commandArgs = [
      `--theme=${theme}`,
      `--layout=${layout}`,
      `--pad=${pad}`
    ];
    
    // Add optional arguments
    if (darkTheme >= 0) {
      commandArgs.push(`--dark-theme=${darkTheme}`);
    }
    
    if (sketchMode) {
      commandArgs.push('--sketch');
    }
    
    const argsString = commandArgs.join(' ');
    console.log(`Running D2 wrapper with options: ${argsString}`);
    
    // Execute the command with the args
    console.log(`Running D2 wrapper: "${wrapperPath}" "${d2FilePath}" "${svgFilePath}" ${argsString}`);
    const command = `node "${wrapperPath}" "${d2FilePath}" "${svgFilePath}" ${argsString}`;
    await execAsync(command, { timeout: 30000 }); // 30 second timeout
    
    if (!fs.existsSync(svgFilePath)) {
      throw new Error(`SVG file was not created at ${svgFilePath}`);
    }
    
    // Read the SVG content
    let svgContent = fs.readFileSync(svgFilePath, 'utf8');
    
    // Apply background color if specified (by injecting style in the SVG)
    if (options.containerBgColor) {
      // Find the opening SVG tag and add a background color
      const bgColor = options.containerBgColor.replace(/[^a-zA-Z0-9#]/g, ''); // Basic sanitization
      svgContent = svgContent.replace(
        /<svg/,
        `<svg style="background-color: ${bgColor};"`
      );
    }
    
    return svgContent;
  } catch (error: any) {
    console.error(`Error converting D2 to SVG: ${error}`);
    
    // Don't create fallback SVG, just throw the original error
    console.error('Error converting D2 to SVG - not creating fallback');
    throw new Error(`Failed to convert D2 to SVG: ${error.message || String(error)}`);
  }
}

/**
 * Converts D2 script to PNG using the d2 CLI tool and Sharp
 * Throws an error if conversion fails
 */
export async function d2ToPng(
  d2FilePath: string, 
  options: { 
    theme?: number; 
    darkTheme?: number;
    layout?: string;
    sketchMode?: boolean;
    pad?: number;
    containerBgColor?: string;
  } = {}
): Promise<Buffer> {
  const pngFileName = path.basename(d2FilePath, '.d2') + '.png';
  const pngFilePath = path.join(PNG_DIRECTORY, pngFileName);
  
  // First check if PNG already exists from a previous generation
  if (fs.existsSync(pngFilePath)) {
    console.log(`Using existing PNG file: ${pngFilePath}`);
    const pngBuffer = fs.readFileSync(pngFilePath);
    return pngBuffer;
  }
  
  // Generate SVG first (we'll convert it to PNG)
  const svgFileName = path.basename(d2FilePath, '.d2') + '.svg';
  const svgFilePath = path.join(SVG_DIRECTORY, svgFileName);
  
  // If SVG doesn't exist yet, create it
  if (!fs.existsSync(svgFilePath)) {
    await d2ToSvg(d2FilePath, options);
  }
  
  try {
    // Import sharp dynamically
    const sharp = await import('sharp');
    
    // Read the SVG file
    const svgContent = fs.readFileSync(svgFilePath, 'utf8');
    
    // Convert SVG to PNG using sharp
    await sharp.default(Buffer.from(svgContent))
      .resize({ 
        width: 1200,  // Set reasonably large dimensions for diagram clarity
        height: 800,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 } // White background
      })
      .png()
      .toFile(pngFilePath);
    
    console.log(`PNG saved to ${pngFilePath} using Sharp`);
    
    // Return the PNG data
    const pngBuffer = fs.readFileSync(pngFilePath);
    return pngBuffer;
  } catch (error: any) {
    console.error(`Error converting D2 to PNG: ${error}`);
    throw new Error(`Failed to convert SVG to PNG: ${error.message || String(error)}`);
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

// Removed fallback SVG generator function as per user request

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