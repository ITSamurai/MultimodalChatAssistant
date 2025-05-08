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
  } catch (error) {
    console.error(`Error converting D2 to SVG: ${error}`);
    
    // Create a better fallback SVG directly
    console.log('Creating fallback SVG...');
    try {
      // Read the D2 script
      const d2Content = fs.readFileSync(d2FilePath, 'utf8');
      
      // Get the SVG file path
      const svgFileName = path.basename(d2FilePath, '.d2') + '.svg';
      const fallbackSvgPath = path.join(SVG_DIRECTORY, svgFileName);
      
      // Generate a nice SVG fallback that shows the D2 script
      const svgContent = generateD2FallbackSVG(d2Content, fallbackSvgPath);
      return svgContent;
    } catch (fallbackError) {
      console.error(`Failed to create fallback SVG: ${fallbackError}`);
      throw error;
    }
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
 * Generates a fallback SVG when D2 fails to render
 */
function generateD2FallbackSVG(d2Content: string, outputPath: string): string {
  // Escape the D2 content for safe embedding in SVG
  const safeD2Content = d2Content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  
  // Parse the D2 content to visualize it better
  const lines = d2Content.split('\n');
  let svgElements = '';
  let yPos = 220;
  const boxSpacing = 60;
  const connectionY = 30;
  
  // Look for nodes and connections in the D2 script
  const nodes = new Map();
  const connections = [];
  
  // Simple regex-based parser for D2 script
  for (const line of lines) {
    // Look for node definitions: name: "Label"
    const nodeMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*"([^"]+)"/);
    if (nodeMatch) {
      const [, id, label] = nodeMatch;
      nodes.set(id, { id, label });
    }
    
    // Look for connections: a -> b -> c
    const connectionMatch = line.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*->\s*([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (connectionMatch) {
      for (const conn of connectionMatch) {
        const [source, target] = conn.split('->').map(s => s.trim());
        connections.push({ source, target });
      }
    }
  }
  
  // Generate visual boxes for nodes
  let xPos = 150;
  const renderedNodes = new Map();
  const nodesToRender = Array.from(nodes.values());
  
  // If parsing didn't work, just show the script as text
  if (nodesToRender.length === 0) {
    svgElements = `
      <rect x="100" y="200" width="600" height="300" fill="#f8f9fa" stroke="#e9ecef" stroke-width="1" rx="5" ry="5" />
      <foreignObject x="120" y="220" width="560" height="260">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: monospace; font-size: 14px; white-space: pre; color: #333; overflow: auto; height: 100%;">
${safeD2Content}
        </div>
      </foreignObject>
    `;
  } else {
    // Render nodes in a flow layout
    nodesToRender.forEach((node, index) => {
      const boxWidth = 150;
      const boxHeight = 60;
      
      // Calculate position (simple horizontal layout)
      xPos = 150 + (index * (boxWidth + 50));
      
      // Reset to next row if we're going too wide
      if (xPos > 650) {
        xPos = 150;
        yPos += boxHeight + 80;
      }
      
      // Record the node position for connections
      renderedNodes.set(node.id, { x: xPos + boxWidth/2, y: yPos + boxHeight/2 });
      
      // Add the node to the SVG
      svgElements += `
        <rect x="${xPos}" y="${yPos}" width="${boxWidth}" height="${boxHeight}" rx="6" ry="6" 
              fill="#f5f5f5" stroke="#333333" stroke-width="2" />
        <text x="${xPos + boxWidth/2}" y="${yPos + boxHeight/2}" 
              font-family="Arial" font-size="14" text-anchor="middle" dominant-baseline="middle">
          ${node.label}
        </text>
      `;
    });
    
    // Render connections
    connections.forEach(conn => {
      const source = renderedNodes.get(conn.source);
      const target = renderedNodes.get(conn.target);
      
      if (source && target) {
        // Draw a line connecting the nodes
        svgElements += `
          <line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" 
                stroke="#666" stroke-width="2" marker-end="url(#arrowhead)" />
        `;
      }
    });
    
    // Prepend the arrow marker definition
    svgElements = `
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
        </marker>
      </defs>
    ` + svgElements;
  }
  
  // Prepare our complete SVG
  const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f8f9fa" />
  <rect x="50" y="50" width="700" height="500" fill="white" stroke="#e9ecef" stroke-width="2" rx="10" ry="10" />
  
  <text x="400" y="100" font-family="Arial" font-size="24" text-anchor="middle" fill="#333">
    D2 Diagram Preview
  </text>
  
  <text x="400" y="150" font-family="Arial" font-size="14" text-anchor="middle" fill="#666">
    Simplified representation based on your D2 script
  </text>
  
  ${svgElements}
</svg>`;
  
  // Write to file
  try {
    fs.writeFileSync(outputPath, svgContent);
    console.log(`Created fallback SVG: ${outputPath}`);
  } catch (writeError) {
    console.error('Error writing fallback SVG:', writeError);
  }
  
  return svgContent;
}

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