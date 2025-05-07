#!/usr/bin/env node
/**
 * D2 Wrapper Script
 * 
 * This script provides a wrapper around the D2 CLI tool to handle any errors
 * or inconsistencies with the D2 installation.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Usage: node d2-wrapper.js <input file> <output file> [--theme=xxx] [--layout=xxx]
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node d2-wrapper.js <input file> <output file> [--theme=xxx] [--layout=xxx]');
  process.exit(1);
}

const inputFile = args[0];
const outputFile = args[1];

// Check if input file exists
if (!fs.existsSync(inputFile)) {
  console.error(`Input file does not exist: ${inputFile}`);
  process.exit(1);
}

// Extract options from the remaining arguments
const options = args.slice(2).join(' ');

// Create a fallback SVG if D2 fails
function createFallbackSVG(outputFile, errorMessage) {
  // Try to read the input D2 file
  let d2Content = '';
  try {
    d2Content = fs.readFileSync(inputFile, 'utf8').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  } catch (readError) {
    console.error(`Failed to read input file: ${readError.message}`);
    d2Content = 'Could not read D2 content';
  }
  
  const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="100%" height="100%" fill="#f8f9fa" />
  <rect x="50" y="50" width="700" height="500" fill="white" stroke="#e9ecef" stroke-width="2" rx="10" ry="10" />
  
  <text x="400" y="100" font-family="Arial" font-size="24" text-anchor="middle" fill="#cc0000">
    D2 Diagram Generation Error
  </text>
  
  <text x="400" y="150" font-family="Arial" font-size="16" text-anchor="middle" fill="#333">
    ${errorMessage || 'An error occurred while generating the diagram'}
  </text>
  
  <text x="400" y="190" font-family="Arial" font-size="14" text-anchor="middle" fill="#666">
    Input: ${path.basename(inputFile)}
  </text>
  
  <rect x="100" y="220" width="600" height="300" fill="#f8f9fa" stroke="#e9ecef" stroke-width="1" rx="5" ry="5" />
  
  <foreignObject x="120" y="240" width="560" height="260">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: monospace; font-size: 12px; white-space: pre; color: #333; overflow: auto; height: 100%;">
${d2Content}
    </div>
  </foreignObject>
</svg>
  `;
  
  try {
    fs.writeFileSync(outputFile, svgContent);
    console.log(`Created fallback SVG: ${outputFile}`);
  } catch (writeError) {
    console.error(`Failed to write fallback SVG: ${writeError.message}`);
  }
}

// Extract the D2 content to display in the fallback if needed
const d2Content = fs.readFileSync(inputFile, 'utf8').slice(0, 200) + '...';

// Try to execute D2
try {
  // Use the local D2 installation
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const localD2 = path.join(homeDir, '.local', 'bin', 'd2');
  
  if (!fs.existsSync(localD2)) {
    throw new Error(`D2 not found at expected location: ${localD2}`);
  }
  
  console.log(`Using D2 installation at: ${localD2}`);
  const cmd = `"${localD2}" "${inputFile}" "${outputFile}"`;
  console.log(`Executing: ${cmd}`);
  
  execSync(cmd, { stdio: 'inherit' });
  
  // Check if output file was created
  if (!fs.existsSync(outputFile)) {
    throw new Error('D2 did not generate an output file');
  }
  
  console.log(`Successfully generated diagram: ${outputFile}`);
} catch (error) {
  console.error(`D2 execution failed: ${error.message}`);
  
  try {
    // Try using the system PATH version as a fallback
    console.log('Trying with system PATH D2 installation');
    const sysCmd = `d2 "${inputFile}" "${outputFile}"`;
    
    execSync(sysCmd, { stdio: 'inherit' });
    
    // Check if output file was created
    if (fs.existsSync(outputFile)) {
      console.log(`Successfully generated diagram with system D2: ${outputFile}`);
      process.exit(0);
    }
    
    // If we get here, both attempts failed
    createFallbackSVG(outputFile, `D2 Failed: ${error.message}`);
  } catch (fallbackError) {
    console.error(`Fallback D2 execution failed: ${fallbackError.message}`);
    createFallbackSVG(outputFile, `D2 Failed: ${fallbackError.message}`);
  }
}