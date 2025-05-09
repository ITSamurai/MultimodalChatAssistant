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

// Report D2 failure and exit with error status (no fallback SVG)
function reportD2Failure(errorMessage) {
  console.error(`D2 DIAGRAM ERROR: ${errorMessage}`);
  console.error('=== D2 Error Details ===');
  console.error(`Input file: ${inputFile}`);
  console.error(`Output file: ${outputFile}`);
  console.error(`Options: ${options}`);
  
  // Read the input file content to help with debugging
  try {
    const fileContent = fs.readFileSync(inputFile, 'utf8');
    console.error('=== D2 Script Content ===');
    console.error(fileContent);
  } catch (readError) {
    console.error(`Failed to read input file: ${readError.message}`);
  }
  
  // Exit with error status
  process.exit(1);
}

// Function to preprocess D2 script and fix common issues
function preprocessD2Script(filePath) {
  try {
    // Read the file content
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Track if we made any changes
    let modified = false;
    
    // Remove padding property which is not supported by the installed D2 version
    const paddingRegex = /\s*padding\s*:\s*\d+\s*/g;
    const newContent = content.replace(paddingRegex, '');
    
    if (newContent !== content) {
      console.log('Removed unsupported padding property from D2 script');
      content = newContent;
      modified = true;
    }
    
    // Check if any style blocks are not properly closed
    const styleBlockOpenCount = (content.match(/{/g) || []).length;
    const styleBlockCloseCount = (content.match(/}/g) || []).length;
    
    if (styleBlockOpenCount > styleBlockCloseCount) {
      // There are unclosed style blocks, add closing braces
      const diff = styleBlockOpenCount - styleBlockCloseCount;
      for (let i = 0; i < diff; i++) {
        content += '\n}';
      }
      console.log(`Fixed ${diff} unclosed style blocks`);
      modified = true;
    }
    
    // If we made changes, write back the fixed content
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log('Fixed D2 script issues, wrote back to file');
    }
    
    return { success: true, content };
  } catch (error) {
    console.error(`Error preprocessing D2 script: ${error.message}`);
    return { success: false, error };
  }
}

// Extract the D2 content to display in the fallback if needed
const d2Content = fs.readFileSync(inputFile, 'utf8').slice(0, 200) + '...';

// Preprocess the D2 script to fix any issues
const preprocessResult = preprocessD2Script(inputFile);
if (!preprocessResult.success) {
  console.error('Failed to preprocess D2 script');
}

// Try to execute D2
try {
  // Use the system installed D2 CLI
  const d2Path = '/nix/store/yzym5q8ib2xqp4nr7s7ggk3alsibwg7a-d2-0.6.5/bin/d2';
  
  console.log(`Using D2 installation at: ${d2Path}`);
  const cmd = `"${d2Path}" "${inputFile}" "${outputFile}" ${options}`;
  console.log(`Executing: ${cmd}`);
  
  execSync(cmd, { stdio: 'inherit' });
  
  // Check if output file was created
  if (!fs.existsSync(outputFile)) {
    throw new Error('D2 did not generate an output file');
  }
  
  // If this is a PNG output file, we need to handle it specially
  if (outputFile.toLowerCase().endsWith('.png')) {
    // D2 doesn't natively support PNG export, so we'll use a different approach
    // 1. First create an SVG version
    const svgOutputFile = outputFile.replace(/\.png$/i, '.svg');
    execSync(`"${d2Path}" "${inputFile}" "${svgOutputFile}" ${options}`, { stdio: 'inherit' });
    
    // 2. Now convert SVG to PNG using a browser-based approach
    const playwright = await import('playwright');
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage();
    
    try {
      // Read the SVG file
      const svgContent = fs.readFileSync(svgOutputFile, 'utf8');
      
      // Create an HTML page with the SVG
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { margin: 0; background: white; }
              svg { max-width: 1200px; }
            </style>
          </head>
          <body>
            ${svgContent}
          </body>
        </html>
      `);
      
      // Take a screenshot
      const screenshot = await page.screenshot({ 
        path: outputFile, 
        type: 'png',
        fullPage: true,
        omitBackground: false
      });
      
      console.log(`Successfully generated PNG diagram: ${outputFile}`);
    } catch (pngError) {
      console.error(`Error generating PNG: ${pngError.message}`);
      throw pngError;
    } finally {
      await browser.close();
    }
  } else {
    console.log(`Successfully generated diagram: ${outputFile}`);
  }
} catch (error) {
  console.error(`D2 execution failed: ${error.message}`);
  
  try {
    // Try using the system PATH version as a fallback
    console.log('Trying with system PATH D2 installation');
    const sysCmd = `d2 "${inputFile}" "${outputFile}" ${options}`;
    
    execSync(sysCmd, { stdio: 'inherit' });
    
    // Check if output file was created
    if (fs.existsSync(outputFile)) {
      console.log(`Successfully generated diagram with system D2: ${outputFile}`);
      process.exit(0);
    }
    
    // If we get here, both attempts failed
    reportD2Failure(`D2 Failed: ${error.message}`);
  } catch (fallbackError) {
    console.error(`Fallback D2 execution failed: ${fallbackError.message}`);
    reportD2Failure(`D2 Failed: ${fallbackError.message}`);
  }
}