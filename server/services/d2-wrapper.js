#!/usr/bin/env node
/**
 * D2 Wrapper Script
 * 
 * This script provides a wrapper around the D2 CLI tool to handle any errors
 * or inconsistencies with the D2 installation.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
  const svgContent = `
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#fff0f0" />
  <text x="50%" y="40%" font-family="Arial" font-size="24" text-anchor="middle" fill="#cc0000">
    D2 Diagram Generation Error
  </text>
  <text x="50%" y="50%" font-family="Arial" font-size="16" text-anchor="middle" fill="#333">
    ${errorMessage || 'An error occurred while generating the diagram'}
  </text>
  <text x="50%" y="60%" font-family="Arial" font-size="14" text-anchor="middle" fill="#666">
    Input: ${path.basename(inputFile)}
  </text>
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
  // First try the PATH version
  const cmd = `d2 ${options} "${inputFile}" "${outputFile}"`;
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
    // Try using the newly installed version as a fallback
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const localD2 = path.join(homeDir, '.local', 'bin', 'd2');
    
    if (fs.existsSync(localD2)) {
      console.log(`Trying with local D2 installation: ${localD2}`);
      const localCmd = `"${localD2}" ${options} "${inputFile}" "${outputFile}"`;
      
      execSync(localCmd, { stdio: 'inherit' });
      
      // Check if output file was created
      if (fs.existsSync(outputFile)) {
        console.log(`Successfully generated diagram with local D2: ${outputFile}`);
        process.exit(0);
      }
    }
    
    // If we get here, both attempts failed
    createFallbackSVG(outputFile, `D2 Failed: ${error.message}`);
  } catch (fallbackError) {
    console.error(`Fallback D2 execution failed: ${fallbackError.message}`);
    createFallbackSVG(outputFile, `D2 Failed: ${fallbackError.message}`);
  }
}