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
    
    // Build command with arguments based on configuration
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
  } catch (error) {
    console.error(`Error converting D2 to SVG: ${error}`);
    throw error;
  }
}

/**
 * Converts D2 script to PNG using the d2 CLI tool and puppeteer
 * If PNG generation fails, a fallback PNG is created
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
): Promise<Buffer | null> {
  try {
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
    
    // Run the wrapper script directly with await to ensure the PNG is generated properly
    try {
      // Use Puppeteer directly to convert the SVG to PNG - this approach is more reliable
      // Use dynamic import for ESM compatibility
      const puppeteer = await import('puppeteer');
      
      const browser = await puppeteer.default.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
      });
      
      try {
        const page = await browser.newPage();
        
        // Read the SVG file
        const svgContent = fs.readFileSync(svgFilePath, 'utf8');
        
        // Create an HTML page with the SVG embedded
        await page.setContent(`
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { margin: 0; padding: 20px; background: white; }
                svg { max-width: 100%; height: auto; }
              </style>
            </head>
            <body>
              ${svgContent}
            </body>
          </html>
        `);
        
        // Wait for any rendering to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Take a screenshot as PNG
        await page.screenshot({
          path: pngFilePath,
          fullPage: true,
          omitBackground: false,
          type: 'png'
        });
        
        console.log(`PNG saved to ${pngFilePath}`);
        
        // Return the PNG data
        const pngBuffer = fs.readFileSync(pngFilePath);
        return pngBuffer;
      } finally {
        await browser.close();
      }
    } catch (puppeteerError) {
      console.error('Error converting with Puppeteer:', puppeteerError);
      
      // Create a simple valid PNG file if conversion failed
      try {
        // This is a 1x1 transparent PNG
        const transparentPng = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64'
        );
        
        fs.writeFileSync(pngFilePath, transparentPng);
        console.log(`Created a fallback PNG at ${pngFilePath}`);
        return transparentPng;
      } catch (fallbackError) {
        console.error('Error creating fallback PNG:', fallbackError);
      }
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