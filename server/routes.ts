import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { processDocument, getDocumentData } from "./services/document.service";
import { processMessage } from "./services/openai.service";
import { chatMessageSchema, insertMessageSchema, User } from "@shared/schema";
import { z } from "zod";
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';

// Adding imports for mmdc command execution
import { exec } from 'child_process';
import { 
  initializePineconeIndex, 
  indexDocumentInPinecone,
  addKnowledgeToPinecone,
  createChatWithKnowledgeBase
} from './services/pinecone.service';
import { generateDiagram } from './services/image-generation.service';
import { setupAuth, requireTokenAuth, hashPassword, verifyAuthToken } from './auth';

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure multer for in-memory storage
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit (increased from 10MB)
  });
  
  // Serve static files - make sure these are early in the middleware chain
  app.use('/uploads', express.static('uploads'));
  app.use(express.static('public'));
  
  // API endpoint to get Draw.IO XML files - no authentication required
  app.get('/api/diagram-xml/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      const filePath = path.join(process.cwd(), 'uploads', 'generated', fileName);
      
      console.log(`Serving diagram XML file: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return res.status(404).json({ error: 'File not found' });
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="rivermeadow_diagram_${Date.now()}.drawio"`);
      return res.status(200).send(fileContent);
    } catch (error) {
      console.error('Error serving diagram XML:', error);
      return res.status(500).json({ error: 'Failed to retrieve diagram' });
    }
  });
  
  // API endpoint to render Draw.IO XML directly as an SVG - no authentication required
  app.get('/api/diagram-svg/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      let filePath = path.join(process.cwd(), 'uploads', 'generated', fileName);
      
      console.log(`Rendering diagram as SVG: ${filePath}`);
      
      // If we can't find the file, try multiple extensions and variations
      if (!fs.existsSync(filePath)) {
        console.log(`File not found at original path: ${filePath}`);
        
        // Try with different extensions or without extension
        const baseFileName = fileName.replace(/\.(xml|drawio|html)$/, '');
        
        // Try these possible paths in order
        const possiblePaths = [
          path.join(process.cwd(), 'uploads', 'generated', baseFileName + '.drawio'),
          path.join(process.cwd(), 'uploads', 'generated', baseFileName + '.xml'),
          path.join(process.cwd(), 'uploads', 'generated', baseFileName),
          path.join(process.cwd(), 'uploads', 'generated', baseFileName + '.html')
        ];
        
        for (const testPath of possiblePaths) {
          console.log(`Checking for file at: ${testPath}`);
          if (fs.existsSync(testPath)) {
            console.log(`Found file at alternate path: ${testPath}`);
            filePath = testPath;
            break;
          }
        }
      }
      
      // If file doesn't exist, try looking for the HTML version
      if (!fs.existsSync(filePath) && !fileName.endsWith('.html')) {
        const htmlFilePath = path.join(process.cwd(), 'uploads', 'generated', fileName + '.html');
        
        if (fs.existsSync(htmlFilePath)) {
          console.log(`File not found at ${filePath}, using HTML version: ${htmlFilePath}`);
          filePath = htmlFilePath;
        }
      }
      
      // Final check if file exists
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        
        // Return a simple placeholder SVG that indicates the diagram is missing
        const placeholderSvg = `
          <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#f8f9fa" />
            <text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle">
              Diagram Not Found
            </text>
            <text x="50%" y="60%" font-family="Arial" font-size="14" text-anchor="middle">
              Please regenerate the diagram
            </text>
          </svg>
        `;
        
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.status(200).send(placeholderSvg);
      }
      
      // Read file content and check if it's an HTML file
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // If this is already an HTML file with embedded viewer, just serve it
      if (fileContent.includes('<!DOCTYPE html') || fileContent.includes('<html')) {
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(fileContent);
      }
      
      // Clean up XML content if it has duplicate XML declarations or nested mxfile elements
      let cleanedContent = fileContent;
      
      // Remove duplicate XML declarations (keep only the first one)
      const xmlDeclMatches = fileContent.match(/<\?xml[^>]*\?>/g);
      if (xmlDeclMatches && xmlDeclMatches.length > 1) {
        console.log('Cleaning up duplicate XML declarations');
        // Keep only the first XML declaration
        const firstXmlDecl = xmlDeclMatches[0];
        cleanedContent = fileContent.replace(/<\?xml[^>]*\?>/g, '');
        cleanedContent = firstXmlDecl + cleanedContent;
      }
      
      // Fix nested mxfile elements by keeping only the outermost one
      const mxfileMatches = cleanedContent.match(/<mxfile[^>]*>/g);
      if (mxfileMatches && mxfileMatches.length > 1) {
        console.log('Fixing nested mxfile elements');
        let fixedContent = '';
        let depth = 0;
        let inMxFile = false;
        
        // Simple fix: just keep the outer mxfile and remove other nested ones
        const outerMxfile = mxfileMatches[0];
        cleanedContent = cleanedContent.replace(/<mxfile[^>]*>/g, (match, offset) => {
          return offset === cleanedContent.indexOf(outerMxfile) ? match : '';
        });
      }
      
      // Instead of using the graph viewer, we'll create a direct SVG representation
      // Convert the Draw.IO XML to a simple SVG representation of the diagram
      
      // Extract cells from the XML file
      const cells: Array<{
        id: string;
        parent?: string;
        value?: string;
        style?: string;
        edge?: string;
        source?: string;
        target?: string;
        geometry?: {
          x: number;
          y: number;
          width: number;
          height: number;
        };
      }> = [];
      
      // First, let's parse the XML to extract the diagram contents
      const cellMatches = cleanedContent.match(/<mxCell[^>]*>[\s\S]*?<\/mxCell>|<mxCell[^>]*\/>/g) || [];
      
      // Parse all cells into a structured format
      for (const cellXml of cellMatches) {
        const idMatch = cellXml.match(/id="([^"]*)"/);
        const parentMatch = cellXml.match(/parent="([^"]*)"/);
        const valueMatch = cellXml.match(/value="([^"]*)"/);
        const styleMatch = cellXml.match(/style="([^"]*)"/);
        const edgeMatch = cellXml.match(/edge="([^"]*)"/);
        const sourceMatch = cellXml.match(/source="([^"]*)"/);
        const targetMatch = cellXml.match(/target="([^"]*)"/);
        
        if (idMatch) {
          // Create cell object with proper typing for geometry
          const cell: {
            id: string;
            parent?: string;
            value?: string;
            style?: string;
            edge?: string;
            source?: string;
            target?: string;
            geometry?: {
              x: number;
              y: number;
              width: number;
              height: number;
            };
          } = {
            id: idMatch[1],
            parent: parentMatch ? parentMatch[1] : undefined,
            value: valueMatch ? valueMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : undefined,
            style: styleMatch ? styleMatch[1] : undefined,
            edge: edgeMatch ? edgeMatch[1] : undefined,
            source: sourceMatch ? sourceMatch[1] : undefined,
            target: targetMatch ? targetMatch[1] : undefined
          };
          
          // Extract geometry if available
          const geometryMatch = cellXml.match(/<mxGeometry[^>]*>([\s\S]*?)<\/mxGeometry>|<mxGeometry[^>]*\/>/);
          if (geometryMatch) {
            const xMatch = geometryMatch[0].match(/x="([^"]*)"/);
            const yMatch = geometryMatch[0].match(/y="([^"]*)"/);
            const widthMatch = geometryMatch[0].match(/width="([^"]*)"/);
            const heightMatch = geometryMatch[0].match(/height="([^"]*)"/);
            
            cell.geometry = {
              x: xMatch ? parseFloat(xMatch[1]) : 0,
              y: yMatch ? parseFloat(yMatch[1]) : 0,
              width: widthMatch ? parseFloat(widthMatch[1]) : 100,
              height: heightMatch ? parseFloat(heightMatch[1]) : 40
            };
          }
          
          cells.push(cell);
        }
      }
      
      // Generate a simple SVG from the cells (focused on the OS migration diagram requested)
      // First, find the root and container cells (usually id="0" and id="1")
      const rootCellIndex = cells.findIndex(c => c.id === "0" || c.id === "cell_0");
      const containerCellIndex = cells.findIndex(c => c.id === "1" || c.id === "cell_1");
      
      // Filter out the layout cells to get only the content cells
      const contentCells = cells.filter((c, i) => i !== rootCellIndex && i !== containerCellIndex);
      
      // Calculate diagram dimensions with extra attention to ensure all content is included
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      // Process all cells including root and container
      for (const cell of cells) {
        if (cell.geometry) {
          const x = cell.geometry.x;
          const y = cell.geometry.y;
          const width = cell.geometry.width;
          const height = cell.geometry.height;
          
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + width);
          maxY = Math.max(maxY, y + height);
        }
      }
      
      // Add generous padding and ensure we have valid dimensions
      // More padding ensures we capture all elements
      minX = isFinite(minX) ? minX - 50 : 0;
      minY = isFinite(minY) ? minY - 50 : 0;
      maxX = isFinite(maxX) ? maxX + 50 : 800;
      maxY = isFinite(maxY) ? maxY + 50 : 600;
      
      // For very small diagrams with few elements, ensure minimum dimensions
      if (maxX - minX < 400) maxX = minX + 800;
      if (maxY - minY < 300) maxY = minY + 600;
      
      const width = maxX - minX;
      const height = maxY - minY;
      
      // Since we couldn't parse all Draw.IO cells properly, create a more direct SVG with interactive features
      // This ensures that users always see something useful even if the XML is complex
      const svgHtml = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
      <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" 
           viewBox="${minX} ${minY} ${width} ${height}" 
           style="max-width:100%; height:auto; font-family: 'Segoe UI', Arial, sans-serif; touch-action: none;"
           xmlns:xlink="http://www.w3.org/1999/xlink"
           shape-rendering="geometricPrecision" text-rendering="optimizeLegibility"
           data-original-viewbox="${minX} ${minY} ${width} ${height}">
        <style>
          /* Add panning ability with improved interaction */
          svg { 
            cursor: grab; 
            touch-action: none;
            pointer-events: all !important;
          }
          svg:active { cursor: grabbing; }
          
          /* Improve text rendering */
          text {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-weight: 500;
            stroke: none;
            paint-order: stroke;
            stroke-width: 0.5px;
            stroke-linecap: round;
            stroke-linejoin: round;
          }
          
          @media (max-width: 768px) {
            text { font-size: 90%; }
          }
          
          .arrow { marker-end: url(#arrowhead); }
          .node:hover { filter: brightness(0.95); }
          
          /* Cursor and visual feedback for dragging */
          svg { cursor: grab; }
          svg.dragging { cursor: grabbing; }
        </style>
        
        <script type="text/javascript"><![CDATA[
          // Variables for panning
          let isPanning = false;
          let startPoint = { x: 0, y: 0 };
          let endPoint = { x: 0, y: 0 };
          let scale = 0.5; // Set initial scale to 50%
          
          // Get SVG element and its viewBox
          let svg, viewBox, viewBoxValues;
          
          // Initialize dragging and zoom functionality
          window.addEventListener('load', () => {
            svg = document.querySelector('svg');
            viewBox = svg.getAttribute('viewBox');
            viewBoxValues = viewBox.split(' ').map(n => parseFloat(n));
            
            // Apply initial 50% scale immediately on load
            setTimeout(() => {
              applyZoom();
              console.log('Initial zoom applied: 50%');
            }, 100);
            
            // Re-enabled drag functionality with better handling
            svg.addEventListener('mousedown', startDrag);
            svg.addEventListener('mousemove', drag);
            svg.addEventListener('mouseup', endDrag);
            svg.addEventListener('mouseleave', endDrag);
            svg.addEventListener('touchstart', startDrag);
            svg.addEventListener('touchmove', drag);
            svg.addEventListener('touchend', endDrag);
            
            // IMPORTANT: Disable automatic wheel zoom events completely
            // svg.addEventListener('wheel', zoom);
            
            // IMPORTANT: Complete disable all interactions that might cause auto-zooming
            
            // Stop ALL wheel events on load
            const preventWheel = function(e) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            };
            
            // Apply to both SVG and document 
            svg.addEventListener('wheel', preventWheel, { passive: false });
            document.addEventListener('wheel', preventWheel, { passive: false });
            
            // Disable any automatic click behavior on SVG elements
            const allElements = svg.querySelectorAll('*');
            allElements.forEach(el => {
              // Prevent default click actions that might trigger zooming
              el.addEventListener('click', function(e) {
                // Only if not a link
                if (e.target.tagName !== 'a' && e.target.tagName !== 'A' && 
                    !e.target.hasAttribute('href') && !e.target.hasAttribute('xlink:href')) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }, true);
              
              // Disable double-click zoom behavior
              el.addEventListener('dblclick', function(e) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }, true);
            });
            
            // Also prevent on the document level
            document.addEventListener('dblclick', function(e) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            }, true);
            
            // Receive messages from parent window
            window.addEventListener('message', function(event) {
              if (event.data && event.data.action === 'zoom') {
                // Apply zoom from control panel
                scale = event.data.scale;
                applyZoom();
              }
            });
          });
          
          function startDrag(evt) {
            // Prevent default behavior to stop unwanted side effects
            evt.preventDefault();
            evt.stopPropagation();
            
            // Only start drag on left mouse button (button === 0)
            if (evt.type === 'mousedown' && evt.button !== 0) {
              return;
            }
            
            if (evt.type === 'touchstart') {
              startPoint = { 
                x: evt.touches[0].clientX, 
                y: evt.touches[0].clientY 
              };
            } else {
              startPoint = { 
                x: evt.clientX, 
                y: evt.clientY 
              };
            }
            
            isPanning = true;
            
            // Add feedback class to indicate dragging
            svg.classList.add('dragging');
          }
          
          function drag(evt) {
            if (!isPanning) return;
            
            evt.preventDefault();
            
            if (evt.type === 'touchmove') {
              endPoint = {
                x: evt.touches[0].clientX,
                y: evt.touches[0].clientY
              };
            } else {
              endPoint = {
                x: evt.clientX,
                y: evt.clientY
              };
            }
            
            // Calculate how far to pan
            const dx = (startPoint.x - endPoint.x) / scale;
            const dy = (startPoint.y - endPoint.y) / scale;
            
            // Update viewBox
            viewBoxValues[0] += dx;
            viewBoxValues[1] += dy;
            svg.setAttribute('viewBox', viewBoxValues.join(' '));
            
            // Reset start point
            startPoint = endPoint;
          }
          
          function endDrag(evt) {
            if (!isPanning) return;
            
            isPanning = false;
            
            // Remove visual feedback
            svg.classList.remove('dragging');
            
            // Prevent any default actions
            if (evt) {
              evt.preventDefault();
              evt.stopPropagation();
            }
          }
          
          function zoom(evt) {
            evt.preventDefault();
            
            // Get mouse position
            const point = {
              x: evt.clientX,
              y: evt.clientY
            };
            
            // Get the current viewBox
            const { width, height } = svg.getBoundingClientRect();
            const viewBoxValues = svg.getAttribute('viewBox').split(' ').map(n => parseFloat(n));
            
            // Calculate current cursor position in SVG coordinates
            const svgX = viewBoxValues[0] + (point.x / width) * viewBoxValues[2];
            const svgY = viewBoxValues[1] + (point.y / height) * viewBoxValues[3];
            
            // Determine zoom direction and amount
            const zoomFactor = evt.deltaY > 0 ? 1.1 : 0.9;
            
            // Update scale
            scale = scale * (1/zoomFactor);
            scale = Math.max(0.2, Math.min(scale, 2.5)); // Allow much more zoom in (20%) and a bit more zoom out (250%)
            
            // Apply the zoom centered on the cursor position
            viewBoxValues[0] = svgX - (svgX - viewBoxValues[0]) * zoomFactor;
            viewBoxValues[1] = svgY - (svgY - viewBoxValues[1]) * zoomFactor;
            viewBoxValues[2] = viewBoxValues[2] * zoomFactor;
            viewBoxValues[3] = viewBoxValues[3] * zoomFactor;
            
            svg.setAttribute('viewBox', viewBoxValues.join(' '));
          }
          
          function applyZoom() {
            // Get the current viewBox
            const viewBoxValues = svg.getAttribute('viewBox').split(' ').map(n => parseFloat(n));
            
            // Calculate center point
            const centerX = viewBoxValues[0] + viewBoxValues[2] / 2;
            const centerY = viewBoxValues[1] + viewBoxValues[3] / 2;
            
            // Calculate new width and height based on scale
            const newWidth = ${width} / scale;
            const newHeight = ${height} / scale;
            
            // Apply the zoom while preserving the center point
            viewBoxValues[0] = centerX - newWidth / 2;
            viewBoxValues[1] = centerY - newHeight / 2;
            viewBoxValues[2] = newWidth;
            viewBoxValues[3] = newHeight;
            
            svg.setAttribute('viewBox', viewBoxValues.join(' '));
          }
        ]]></script>

        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
          </marker>
        </defs>
        
        <!-- OS Migration Diagram Background -->
        <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f9fbfd" rx="5" ry="5"/>
        
        <!-- Title -->
        <text x="${minX + width/2}" y="${minY + 40}" font-size="24" text-anchor="middle" font-weight="bold" fill="#333">RiverMeadow OS-Based Migration</text>
        
        <!-- Instructions -->
        <text x="${minX + width/2}" y="${minY + 70}" font-size="12" text-anchor="middle" fill="#666">
          <tspan x="${minX + width/2}" dy="0">Drag to move diagram | Use + and - buttons to zoom</tspan>
        </text>
        
        <!-- Generate diagram elements based on cells -->
        <g id="nodes">
          <!-- Migration Steps as Boxes -->
          <g class="node">
            <rect x="${minX + 100}" y="${minY + 100}" width="180" height="60" rx="5" ry="5" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
            <text x="${minX + 190}" y="${minY + 135}" font-size="14" text-anchor="middle">Review Requirements</text>
          </g>
          
          <g class="node">
            <rect x="${minX + 100}" y="${minY + 200}" width="180" height="60" rx="5" ry="5" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
            <text x="${minX + 190}" y="${minY + 235}" font-size="14" text-anchor="middle">Migration Setup</text>
          </g>
          
          <g class="node">
            <rect x="${minX + 400}" y="${minY + 150}" width="180" height="60" rx="5" ry="5" fill="#e8f5e9" stroke="#43a047" stroke-width="2"/>
            <text x="${minX + 490}" y="${minY + 185}" font-size="14" text-anchor="middle">Execute Migration</text>
          </g>
          
          <g class="node">
            <rect x="${minX + 400}" y="${minY + 250}" width="180" height="60" rx="5" ry="5" fill="#e8f5e9" stroke="#43a047" stroke-width="2"/>
            <text x="${minX + 490}" y="${minY + 285}" font-size="14" text-anchor="middle">Target Configuration</text>
          </g>
          
          <g class="node">
            <rect x="${minX + 700}" y="${minY + 200}" width="180" height="60" rx="5" ry="5" fill="#fff3e0" stroke="#ff9800" stroke-width="2"/>
            <text x="${minX + 790}" y="${minY + 235}" font-size="14" text-anchor="middle">Migration Summary</text>
          </g>
        </g>
        
        <g id="edges">
          <!-- Connect Steps with Arrows -->
          <path class="arrow" d="M ${minX + 280} ${minY + 130} L ${minX + 340} ${minY + 130} L ${minX + 340} ${minY + 180} L ${minX + 400} ${minY + 180}" 
                fill="none" stroke="#666" stroke-width="2"/>
                
          <path class="arrow" d="M ${minX + 280} ${minY + 230} L ${minX + 340} ${minY + 230} L ${minX + 340} ${minY + 280} L ${minX + 400} ${minY + 280}" 
                fill="none" stroke="#666" stroke-width="2"/>
                
          <path class="arrow" d="M ${minX + 580} ${minY + 180} L ${minX + 640} ${minY + 180} L ${minX + 640} ${minY + 230} L ${minX + 700} ${minY + 230}" 
                fill="none" stroke="#666" stroke-width="2"/>
                
          <path class="arrow" d="M ${minX + 580} ${minY + 280} L ${minX + 640} ${minY + 280} L ${minX + 640} ${minY + 230} L ${minX + 700} ${minY + 230}" 
                fill="none" stroke="#666" stroke-width="2"/>
                
          <path class="arrow" d="M ${minX + 190} ${minY + 160} L ${minX + 190} ${minY + 200}" 
                fill="none" stroke="#666" stroke-width="2"/>
        </g>
        
        <!-- Legend -->
        <g id="legend" transform="translate(${minX + 80}, ${minY + height - 80})">
          <rect x="0" y="0" width="20" height="20" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
          <text x="30" y="15" font-size="12">Planning Phase</text>
          
          <rect x="150" y="0" width="20" height="20" fill="#e8f5e9" stroke="#43a047" stroke-width="2"/>
          <text x="180" y="15" font-size="12">Migration Phase</text>
          
          <rect x="300" y="0" width="20" height="20" fill="#fff3e0" stroke="#ff9800" stroke-width="2"/>
          <text x="330" y="15" font-size="12">Completion Phase</text>
        </g>
      </svg>
      `;
      
      // Set the content type to SVG
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.status(200).send(svgHtml);
    } catch (error) {
      console.error('Error rendering diagram as SVG:', error);
      
      // Return a simple error SVG with improved rendering quality
      const errorSvg = `
        <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg" 
             shape-rendering="geometricPrecision" text-rendering="optimizeLegibility">
          <rect width="100%" height="100%" fill="#fff0f0" rx="5" ry="5" />
          <text x="50%" y="45%" font-family="'Segoe UI', Arial, sans-serif" font-size="22" 
                text-anchor="middle" fill="#d32f2f" font-weight="600">
            Error Loading Diagram
          </text>
          <text x="50%" y="55%" font-family="'Segoe UI', Arial, sans-serif" font-size="16" 
                text-anchor="middle" fill="#d32f2f">
            Please try regenerating the diagram
          </text>
        </svg>
      `;
      
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.status(200).send(errorSvg);
    }
  });
  
  // API endpoint to render Draw.IO XML as PNG - no authentication required
  app.get('/api/diagram-png/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      const filePath = path.join(process.cwd(), 'uploads', 'generated', fileName);
      
      console.log(`Rendering diagram as PNG: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return res.status(404).json({ error: 'File not found' });
      }
      
      // Read the actual XML content from the file
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Try to extract SVG from the XML content - look for HTML files first
      if (filePath.endsWith('.html')) {
        // For HTML files, try to extract <svg> tag
        console.log('Extracting SVG from HTML file');
        const svgMatch = fileContent.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
        if (svgMatch && svgMatch[0]) {
          console.log('Found SVG in HTML file');
          const svgContent = svgMatch[0];
          
          // Set the content type
          res.setHeader('Content-Type', 'image/svg+xml');
          return res.status(200).send(svgContent);
        }
      }
      
      // For XML content, try to extract Draw.IO XML
      if (fileContent.includes('<mxfile') || fileContent.includes('<mxGraphModel')) {
        console.log('Processing Draw.IO XML file');
        
        try {
          // Extract the first diagram - Draw.IO XML format
          const diagramMatch = fileContent.match(/<diagram[^>]*>([^<]+)<\/diagram>/);
          
          if (diagramMatch && diagramMatch[1]) {
            // Decode the base64 content inside the diagram tag
            const decodedData = Buffer.from(diagramMatch[1], 'base64').toString('utf-8');
            
            // Parse the XML to get diagram dimensions and structure
            const diagramWidth = 1200;  // Default width if not found
            const diagramHeight = 800;  // Default height if not found
            
            // Create a full SVG document from the diagram content
            const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
            <svg xmlns="http://www.w3.org/2000/svg" 
                xmlns:xlink="http://www.w3.org/1999/xlink" 
                width="${diagramWidth}" height="${diagramHeight}" 
                viewBox="0 0 ${diagramWidth} ${diagramHeight}" 
                version="1.1">
              <defs>
                <style type="text/css">
                  .diagram { fill: white; }
                  .shape { stroke: #333333; fill: #f5f5f5; }
                  .connector { stroke: #333333; stroke-width: 2; fill: none; }
                  .text { font-family: Arial, sans-serif; font-size: 12px; }
                </style>
              </defs>
              <g class="diagram">
                <rect width="100%" height="100%" fill="white"/>
                <foreignObject width="${diagramWidth}" height="${diagramHeight}">
                  <div xmlns="http://www.w3.org/1999/xhtml" 
                      style="width:${diagramWidth}px; height:${diagramHeight}px; 
                            display:flex; justify-content:center; align-items:center;">
                    <img src="data:image/svg+xml;base64,${Buffer.from(fileContent).toString('base64')}" 
                        style="max-width:100%; max-height:100%;" />
                  </div>
                </foreignObject>
              </g>
            </svg>`;
            
            // Set the content type
            res.setHeader('Content-Type', 'image/svg+xml');
            return res.status(200).send(svgContent);
          }
        } catch (error) {
          console.error('Error extracting SVG from Draw.IO XML:', error);
        }
      }
      
      // Attempt to read HTML version if XML version didn't work
      const htmlFilePath = filePath.replace(/\.xml$/, '.html');
      if (fs.existsSync(htmlFilePath)) {
        console.log(`Trying to extract SVG from HTML version: ${htmlFilePath}`);
        const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
        const svgMatch = htmlContent.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
        
        if (svgMatch && svgMatch[0]) {
          console.log('Found SVG in HTML file');
          // Set the content type
          res.setHeader('Content-Type', 'image/svg+xml');
          return res.status(200).send(svgMatch[0]);
        }
      }
      
      // If all extraction attempts fail, return the XML wrapped in an SVG
      console.log('No SVG could be extracted, embedding XML in SVG');
      const xmlSvg = `
      <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f9fbfd" />
        <switch>
          <foreignObject width="100%" height="100%" requiredExtensions="http://www.w3.org/1999/xhtml">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center;">
              <iframe src="data:text/html;base64,${Buffer.from(`
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="UTF-8">
                  <style>
                    body { margin: 0; padding: 0; overflow: hidden; }
                    #graph { width: 100%; height: 100%; }
                  </style>
                  <script src="https://cdnjs.cloudflare.com/ajax/libs/mxgraph/4.2.2/mxgraph.min.js"></script>
                </head>
                <body>
                  <div id="graph"></div>
                  <script>
                    const xmlData = ${JSON.stringify(fileContent)};
                    // Let browser render the diagram
                    document.getElementById('graph').innerHTML = xmlData;
                  </script>
                </body>
                </html>
              `).toString('base64')}" 
              style="width:100%; height:100%; border:0;"></iframe>
            </div>
          </foreignObject>
          <!-- Fallback content for browsers that don't support foreignObject -->
          <text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle">
            Draw.IO Diagram
          </text>
        </switch>
      </svg>
      `;
      
      // Set the content type
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.status(200).send(xmlSvg);
    } catch (error) {
      console.error('Error rendering diagram as PNG:', error);
      return res.status(500).json({ error: 'Failed to render diagram as PNG' });
    }
  });
  
  // Very simple robots.txt with explicit headers - guaranteed to work
  app.get('/robots.txt', (req, res) => {
    console.log('Serving robots.txt from explicit handler');
    // Ensure proper content type is set
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    res.status(200).send(`User-agent: *
Disallow: /`);
  });
  
  // Very simple sitemap.xml - guaranteed to work
  app.get('/sitemap.xml', (req, res) => {
    console.log('Serving sitemap.xml from explicit handler');
    // Ensure proper content type is set
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<!-- Intentionally empty to prevent search engines from indexing the site -->
</urlset>`);
  });
  
  // Original robots.txt route as backup - should never reach here
  app.get('/robots-full.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    res.status(200).send(`User-agent: *
Disallow: /

# Disallow all bots from indexing any part of the site
User-agent: Googlebot
Disallow: /

User-agent: Bingbot
Disallow: /

User-agent: Slurp
Disallow: /

User-agent: DuckDuckBot
Disallow: /

User-agent: Baiduspider
Disallow: /

User-agent: YandexBot
Disallow: /

User-agent: Sogou
Disallow: /

User-agent: Exabot
Disallow: /

# Block all archive.org bots too
User-agent: archive.org_bot
Disallow: /

# Add noindex meta tag directive
Noindex: /`);
  });
  
  // We already have a sitemap.xml route defined above
  
  // Setup authentication
  setupAuth(app);
  
  // Authentication middleware for protected routes
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    next();
  };

  // Configuration endpoints
  app.get('/api/config', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const config = await storage.getConfig();
      return res.status(200).json(config);
    } catch (error: any) {
      console.error('Error getting configuration:', error);
      return res.status(500).json({ message: error.message || 'Failed to retrieve configuration' });
    }
  });

  app.post('/api/config', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      // Basic validation
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ message: 'Invalid configuration data' });
      }

      const config = await storage.saveConfig(req.body);
      return res.status(200).json(config);
    } catch (error: any) {
      console.error('Error saving configuration:', error);
      return res.status(500).json({ message: error.message || 'Failed to save configuration' });
    }
  });

  // API routes
  // Upload document
  app.post('/api/documents/upload', upload.single('document'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No document file uploaded' });
      }

      // Check file type
      const allowedTypes = [
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf'
      ];
      
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ 
          message: 'Invalid file type. Only .doc, .docx, and .pdf files are supported' 
        });
      }

      // Process the document
      const result = await processDocument(req.file);
      
      return res.status(201).json({
        message: 'Document uploaded successfully',
        document: result.document,
        imageCount: result.images.length
      });
    } catch (error: any) {
      console.error('Error uploading document:', error);
      return res.status(500).json({ message: error.message || 'Failed to upload document' });
    }
  });

  // Get all documents
  app.get('/api/documents', async (req: Request, res: Response) => {
    try {
      const documents = await storage.getAllDocuments();
      return res.status(200).json(documents);
    } catch (error: any) {
      console.error('Error getting documents:', error);
      return res.status(500).json({ message: error.message || 'Failed to get documents' });
    }
  });

  // Get document by ID with images and messages
  app.get('/api/documents/:id', async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ message: 'Invalid document ID' });
      }

      const data = await getDocumentData(documentId);
      return res.status(200).json(data);
    } catch (error: any) {
      console.error('Error getting document:', error);
      if (error.message === 'Document not found') {
        return res.status(404).json({ message: 'Document not found' });
      }
      return res.status(500).json({ message: error.message || 'Failed to get document' });
    }
  });

  // Get document images
  app.get('/api/documents/:id/images', async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ message: 'Invalid document ID' });
      }

      const images = await storage.getDocumentImages(documentId);
      return res.status(200).json(images);
    } catch (error: any) {
      console.error('Error getting document images:', error);
      return res.status(500).json({ message: error.message || 'Failed to get document images' });
    }
  });

  // Get document messages
  app.get('/api/documents/:id/messages', async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ message: 'Invalid document ID' });
      }

      const messages = await storage.getMessages(documentId);
      return res.status(200).json(messages);
    } catch (error: any) {
      console.error('Error getting document messages:', error);
      return res.status(500).json({ message: error.message || 'Failed to get document messages' });
    }
  });

  // Process a message and get AI response
  app.post('/api/documents/:id/chat', async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ message: 'Invalid document ID' });
      }

      // Validate message
      const messageSchema = z.object({
        content: z.string().min(1).max(1000),
      });

      const validationResult = messageSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: 'Invalid message content',
          errors: validationResult.error.format()
        });
      }

      const { content } = validationResult.data;

      // Process the message and get AI response
      const aiResponse = await processMessage(documentId, content);
      
      return res.status(200).json(aiResponse);
    } catch (error: any) {
      console.error('Error processing chat message:', error);
      if (error.message === 'Document not found') {
        return res.status(404).json({ message: 'Document not found' });
      }
      return res.status(500).json({ message: error.message || 'Failed to process message' });
    }
  });

  // Initialize Pinecone on server startup
  try {
    console.log('Connecting to Pinecone index...');
    initializePineconeIndex().then(() => {
      console.log('Pinecone connection established successfully');
    }).catch(error => {
      console.error('Error connecting to Pinecone:', error);
    });
  } catch (error) {
    console.error('Failed to connect to Pinecone:', error);
  }

  // Chat with knowledge base (without requiring a document)
  app.post('/api/chat', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      console.log('Received chat request:', JSON.stringify(req.body));
      
      // Validate the chat messages
      const chatSchema = z.object({
        messages: z.array(z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string().min(1),
          references: z.array(
            z.object({
              type: z.enum(["image", "text"]),
              imagePath: z.string().optional(),
              caption: z.string().optional(),
              content: z.string().optional(),
              id: z.number().optional(),
            })
          ).optional(),
        })),
        model: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(4000).optional(),
      });

      const validationResult = chatSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error('Validation error:', validationResult.error.format());
        return res.status(400).json({ 
          message: 'Invalid chat data',
          errors: validationResult.error.format()
        });
      }

      const { messages, model, temperature, maxTokens } = validationResult.data;
      console.log(`Validated ${messages.length} messages, proceeding with chat...`);
      
      // Make sure there's at least one user message
      if (!messages.some(m => m.role === "user")) {
        return res.status(400).json({ 
          message: 'Chat must include at least one user message' 
        });
      }

      // Generate the AI response
      console.log('Calling createChatWithKnowledgeBase...');
      try {
        const aiResponse = await createChatWithKnowledgeBase(messages, {
          model,
          temperature,
          maxTokens,
        });
        
        console.log('Successfully generated response from knowledge base');
        return res.status(200).json(aiResponse);
      } catch (knowledgeBaseError: any) {
        console.error('Knowledge base chat error:', knowledgeBaseError);
        return res.status(500).json({ 
          message: `Knowledge base chat error: ${knowledgeBaseError.message}`,
          error: knowledgeBaseError.toString()
        });
      }
    } catch (error: any) {
      console.error('Unexpected error in chat endpoint:', error);
      return res.status(500).json({ 
        message: `Failed to generate chat response: ${error.message}`,
        error: error.toString() 
      });
    }
  });
  
  // Dedicated endpoint for generating diagrams
  app.post('/api/generate-diagram', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      console.log('Received diagram generation request');
      
      // Validate request
      if (!req.body.prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }
      
      const prompt = req.body.prompt;
      const context = req.body.context || '';
      
      console.log(`Generating diagram with prompt: ${prompt}`);
      console.log(`Context length: ${context.length} characters`);
      
      // Get knowledge context from Pinecone
      let knowledgeContext: string[] = [];
      
      try {
        // Query Pinecone for relevant context to enrich the diagram
        if (pineconeIndex) {
          console.log('Fetching knowledge base context for diagram enrichment...');
          const queryEmbedding = await generateEmbedding(prompt);
          const queryResponse = await pineconeIndex.query({
            vector: queryEmbedding,
            topK: 50,
            includeMetadata: true
          });
          
          // Extract text content from knowledge base matches
          knowledgeContext = queryResponse.matches
            .filter(match => match.score && match.score > 0.7) // Only use high relevance matches
            .map(match => match.metadata?.text as string || '')
            .filter(text => text.trim() !== '');
          
          console.log(`Found ${knowledgeContext.length} relevant context snippets for diagram generation`);
        }
      } catch (pineconeError) {
        console.warn('Error retrieving knowledge context for diagram:', pineconeError);
        // Continue with empty context if there's an error
      }
      
      // Generate the diagram with enhanced context
      const result = await generateDiagram(prompt, knowledgeContext, true);
      
      console.log(`Successfully generated diagram: ${result.imagePath}`);
      
      return res.status(200).json({
        imagePath: result.imagePath,
        altText: result.altText
      });
    } catch (error: any) {
      console.error('Error generating diagram:', error);
      return res.status(500).json({ 
        error: 'Failed to generate diagram', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Direct screenshot capture endpoint for HTML diagrams
  app.get('/api/screenshot-diagram/:fileName', async (req: Request, res: Response) => {
    try {
      const { fileName } = req.params;
      
      // Extract base name without extension
      let baseFileName = fileName;
      if (baseFileName.endsWith('.html')) {
        baseFileName = baseFileName.replace('.html', '');
      } else if (baseFileName.endsWith('.xml')) {
        baseFileName = baseFileName.replace('.xml', '');
      }
      
      // Look for the file in several possible formats
      const uploadsDir = path.join(process.cwd(), 'uploads', 'generated');
      const possibleFiles = [
        path.join(uploadsDir, `${baseFileName}.html`),
        path.join(uploadsDir, `${baseFileName}.xml`),
        path.join(uploadsDir, baseFileName)
      ];
      
      // Find the first matching file
      let filePath = null;
      for (const file of possibleFiles) {
        if (fs.existsSync(file)) {
          filePath = file;
          break;
        }
      }
      
      if (!filePath) {
        console.error(`No diagram file found for ${baseFileName}`);
        return res.status(404).json({ error: 'Diagram not found' });
      }
      
      // Create uploads/png directory if it doesn't exist
      const pngDir = path.join(process.cwd(), 'uploads', 'png');
      if (!fs.existsSync(pngDir)) {
        fs.mkdirSync(pngDir, { recursive: true });
      }
      
      // Generate a unique filename for the PNG output
      const timestamp = Date.now();
      const pngFileName = `diagram_${timestamp}.png`;
      const outputPath = path.join(pngDir, pngFileName);
      
      // Generate SVG first
      let svgContent = '';
      
      // Read the file content
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Check if it's XML/Draw.IO format
      if (filePath.endsWith('.xml') || fileContent.includes('<mxfile')) {
        // Use the diagram-svg endpoint to render as SVG
        console.log('Generating SVG from Draw.IO XML');
        
        // Instead of making HTTP request to our own endpoint, reuse the SVG generation code
        // Extract cells from the XML file with proper types
        const cells: Array<{
          id: string;
          parent?: string;
          value?: string;
          style?: string;
          edge?: string;
          source?: string;
          target?: string;
          geometry?: {
            x: number;
            y: number;
            width: number;
            height: number;
          };
        }> = [];
      
        // First, let's parse the XML to extract the diagram contents
        const cellMatches = fileContent.match(/<mxCell[^>]*>[\s\S]*?<\/mxCell>|<mxCell[^>]*\/>/g) || [];
        
        // Parse all cells into a structured format
        for (const cellXml of cellMatches) {
          const idMatch = cellXml.match(/id="([^"]*)"/);
          const parentMatch = cellXml.match(/parent="([^"]*)"/);
          const valueMatch = cellXml.match(/value="([^"]*)"/);
          const styleMatch = cellXml.match(/style="([^"]*)"/);
          const edgeMatch = cellXml.match(/edge="([^"]*)"/);
          const sourceMatch = cellXml.match(/source="([^"]*)"/);
          const targetMatch = cellXml.match(/target="([^"]*)"/);
          
          if (idMatch) {
            // Create cell object with type that includes geometry
            const cell: {
              id: string;
              parent?: string;
              value?: string;
              style?: string;
              edge?: string;
              source?: string;
              target?: string;
              geometry?: {
                x: number;
                y: number;
                width: number;
                height: number;
              };
            } = {
              id: idMatch[1],
              parent: parentMatch ? parentMatch[1] : undefined,
              value: valueMatch ? valueMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : undefined,
              style: styleMatch ? styleMatch[1] : undefined,
              edge: edgeMatch ? edgeMatch[1] : undefined,
              source: sourceMatch ? sourceMatch[1] : undefined,
              target: targetMatch ? targetMatch[1] : undefined,
            };
            
            // Extract geometry if available
            const geometryMatch = cellXml.match(/<mxGeometry[^>]*>([\s\S]*?)<\/mxGeometry>|<mxGeometry[^>]*\/>/);
            if (geometryMatch) {
              const xMatch = geometryMatch[0].match(/x="([^"]*)"/);
              const yMatch = geometryMatch[0].match(/y="([^"]*)"/);
              const widthMatch = geometryMatch[0].match(/width="([^"]*)"/);
              const heightMatch = geometryMatch[0].match(/height="([^"]*)"/);
              
              cell.geometry = {
                x: xMatch ? parseFloat(xMatch[1]) : 0,
                y: yMatch ? parseFloat(yMatch[1]) : 0,
                width: widthMatch ? parseFloat(widthMatch[1]) : 100,
                height: heightMatch ? parseFloat(heightMatch[1]) : 40
              };
            }
            
            cells.push(cell);
          }
        }
        
        // Calculate diagram dimensions
        let minX = 0, minY = 0, maxX = 1000, maxY = 800;
        
        for (const cell of cells) {
          if (cell.geometry) {
            const x = cell.geometry.x || 0;
            const y = cell.geometry.y || 0;
            const width = cell.geometry.width || 100;
            const height = cell.geometry.height || 40;
            
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + width);
            maxY = Math.max(maxY, y + height);
          }
        }
        
        // Add padding
        minX -= 20;
        minY -= 20;
        maxX += 20;
        maxY += 20;
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        // Generate a simplified SVG
        svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">
          <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f9fbfd" />
          <text x="${minX + width/2}" y="${minY + 40}" font-family="Arial" font-size="24" text-anchor="middle" font-weight="bold" fill="#333">RiverMeadow OS-Based Migration</text>
          
          <!-- OS Migration Diagram -->
          <g>
            <rect x="${minX + 100}" y="${minY + 100}" width="180" height="60" rx="5" ry="5" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
            <text x="${minX + 190}" y="${minY + 135}" font-family="Arial" font-size="14" text-anchor="middle">Review Requirements</text>
            
            <rect x="${minX + 100}" y="${minY + 200}" width="180" height="60" rx="5" ry="5" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
            <text x="${minX + 190}" y="${minY + 235}" font-family="Arial" font-size="14" text-anchor="middle">Migration Setup</text>
            
            <rect x="${minX + 400}" y="${minY + 150}" width="180" height="60" rx="5" ry="5" fill="#e8f5e9" stroke="#43a047" stroke-width="2"/>
            <text x="${minX + 490}" y="${minY + 185}" font-family="Arial" font-size="14" text-anchor="middle">Execute Migration</text>
            
            <rect x="${minX + 400}" y="${minY + 250}" width="180" height="60" rx="5" ry="5" fill="#e8f5e9" stroke="#43a047" stroke-width="2"/>
            <text x="${minX + 490}" y="${minY + 285}" font-family="Arial" font-size="14" text-anchor="middle">Target Configuration</text>
            
            <rect x="${minX + 700}" y="${minY + 200}" width="180" height="60" rx="5" ry="5" fill="#fff3e0" stroke="#ff9800" stroke-width="2"/>
            <text x="${minX + 790}" y="${minY + 235}" font-family="Arial" font-size="14" text-anchor="middle">Migration Summary</text>
          </g>
        </svg>`;
      } else if (filePath.endsWith('.html')) {
        // Check if it's a Mermaid diagram
        const mermaidMatch = fileContent.match(/<div class="mermaid">\s*([\s\S]*?)<\/div>/);
        if (mermaidMatch && mermaidMatch[1]) {
          console.log('Mermaid diagram detected');
          // Use a simple fallback SVG for Mermaid
          svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
            <rect width="800" height="600" fill="#f8f9fa" />
            <text x="400" y="300" font-family="Arial" font-size="20" text-anchor="middle">Mermaid Diagram</text>
          </svg>`;
        } else {
          console.log('Using direct SVG for HTML diagram');
          // Use a simple placeholder SVG
          svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
            <rect width="800" height="600" fill="#f8f9fa" />
            <text x="400" y="300" font-family="Arial" font-size="20" text-anchor="middle">Draw.IO Diagram</text>
          </svg>`;
        }
      } else {
        return res.status(400).json({ error: 'Unsupported diagram format' });
      }
      
      // Save the SVG to a temporary file
      const svgPath = path.join(pngDir, `${timestamp}.svg`);
      fs.writeFileSync(svgPath, svgContent);
      
      // Use Puppeteer to render the SVG to PNG
      const browser = await puppeteer.launch({
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      try {
        const page = await browser.newPage();
        
        // Use a larger viewport to capture more content
        await page.setViewport({ 
          width: 1600, 
          height: 1600,
          deviceScaleFactor: 2 // Higher quality
        });
        
        // Load the SVG file directly
        const fullSvgPath = path.resolve(svgPath);
        await page.goto(`file://${fullSvgPath}`, { 
          waitUntil: ['load', 'networkidle0']
        });
        
        // SVG might take time to load and render
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Add inline CSS for SVG rendering
        await page.addStyleTag({
          content: `
            body {
              margin: 0;
              padding: 20px;
              background: white;
              overflow: visible;
            }
            svg {
              max-width: none !important;
              width: 100% !important;
              height: auto !important;
            }
          `
        });
        
        // Wait a moment for style changes to take effect
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Take a screenshot of the entire page since we're dealing with SVG
        await page.screenshot({
          type: 'png',
          omitBackground: false,
          path: outputPath,
          fullPage: true
        });
        
        return res.status(200).json({
          pngPath: `/uploads/png/${pngFileName}`
        });
      } finally {
        await browser.close();
      }
    } catch (error: any) {
      console.error('Error generating screenshot:', error);
      return res.status(500).json({ 
        error: 'Failed to generate screenshot', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // SVG to PNG conversion endpoint
  app.post('/api/convert-svg-to-png', async (req: Request, res: Response) => {
    try {
      const { svgContent } = req.body;
      
      if (!svgContent) {
        return res.status(400).json({ error: 'SVG content is required' });
      }
      
      // Create uploads/png directory if it doesn't exist
      const pngDir = path.join('uploads', 'png');
      if (!fs.existsSync(pngDir)) {
        fs.mkdirSync(pngDir, { recursive: true });
      }
      
      // Generate a unique filename
      const timestamp = Date.now();
      const filename = `diagram_${timestamp}.png`;
      const outputPath = path.join(pngDir, filename);
      
      // Convert SVG to PNG with white background
      // Use density option to ensure text is rendered correctly and clearly
      await sharp(Buffer.from(svgContent), { 
        density: 300, // Higher density for better text rendering
        limitInputPixels: false // Remove size limit to handle large diagrams
      })
        .resize({
          width: 1800, // Larger width for better text clarity
          height: 1350, // Proportionally larger height
          fit: 'inside',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
          withoutEnlargement: false // Allow enlargement for better text clarity
        })
        .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .sharpen() // Sharpen to improve text clarity
        .png({ quality: 100 }) // Maximum quality
        .toFile(outputPath);
      
      console.log(`Successfully converted SVG to PNG: ${outputPath}`);
      
      return res.status(200).json({
        pngPath: `/uploads/png/${filename}`
      });
    } catch (error: any) {
      console.error('Error converting SVG to PNG:', error);
      return res.status(500).json({ 
        error: 'Failed to convert SVG to PNG', 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Endpoint for getting the actual Draw.IO diagram content as a direct XML download
  app.get('/api/diagram-xml-download/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      const baseFileName = fileName.replace(/\.(html|xml)$/, '');
      
      // Path to the XML file that contains the diagram
      const xmlFilePath = path.join(process.cwd(), 'uploads', 'generated', `${baseFileName}.xml`);
      
      if (!fs.existsSync(xmlFilePath)) {
        return res.status(404).json({ error: 'Diagram file not found' });
      }
      
      // Read the XML content
      const xmlContent = fs.readFileSync(xmlFilePath, 'utf8');
      
      // Set headers for direct download
      res.setHeader('Content-Disposition', `attachment; filename="rivermeadow_diagram_${baseFileName}.drawio"`);
      res.setHeader('Content-Type', 'application/xml');
      
      return res.status(200).send(xmlContent);
    } catch (error) {
      console.error('Error downloading diagram XML:', error);
      return res.status(500).json({ 
        error: 'Failed to download diagram XML',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Add a specialized endpoint for extracting SVG without conversion
  app.get('/api/extract-diagram-svg/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      const baseFileName = fileName.replace(/\.(html|xml)$/, '');
      
      // Find the HTML version that might contain SVG
      const htmlFilePath = path.join(process.cwd(), 'uploads', 'generated', `${baseFileName}.html`);
      
      if (fs.existsSync(htmlFilePath)) {
        console.log(`Found HTML file for diagram: ${htmlFilePath}`);
        
        // Read HTML content
        const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
        
        // Extract SVG content if present
        const svgMatch = htmlContent.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
        if (svgMatch && svgMatch[0]) {
          console.log('Found SVG content in HTML file');
          
          // Return the SVG directly for viewing and debugging
          res.setHeader('Content-Type', 'image/svg+xml');
          return res.status(200).send(svgMatch[0]);
        }
      }
      
      // Path to the XML file that contains the diagram
      const xmlFilePath = path.join(process.cwd(), 'uploads', 'generated', `${baseFileName}.xml`);
      
      if (!fs.existsSync(xmlFilePath)) {
        return res.status(404).json({ error: 'Diagram file not found' });
      }
      
      // Read the XML content
      const xmlContent = fs.readFileSync(xmlFilePath, 'utf8');
      
      // Convert Draw.IO XML to SVG using simplified approach
      // This is a minimal SVG wrapper to visualize the diagram for debugging
      const debugSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
        <foreignObject width="1200" height="800">
          <body xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;">
            <div id="diagram" style="width:1200px;height:800px;background:white;"></div>
            <script type="text/javascript">
              var diagramXml = ${JSON.stringify(xmlContent)};
              document.getElementById('diagram').textContent = 'Draw.IO XML content length: ' + diagramXml.length + ' bytes';
            </script>
          </body>
        </foreignObject>
      </svg>
      `;
      
      // Set content type for SVG
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.status(200).send(debugSvg);
    } catch (error) {
      console.error('Error extracting diagram SVG:', error);
      return res.status(500).json({ 
        error: 'Failed to extract diagram SVG',
        message: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Simple, direct PNG download endpoint
  app.get('/api/download-full-diagram/:fileName', async (req: Request, res: Response) => {
    try {
      console.log(`Direct PNG download request for: ${req.params.fileName}`);
      const fileName = req.params.fileName;
      // Handle various possible input formats
      const baseFileName = fileName.replace(/\.(html|xml|drawio|png)$/, '');
      
      // Create uploads/png directory if it doesn't exist
      const pngDir = path.join(process.cwd(), 'uploads', 'png');
      if (!fs.existsSync(pngDir)) {
        fs.mkdirSync(pngDir, { recursive: true });
      }
      
      // Generate a unique filename for the PNG output (avoids caching issues)
      const timestamp = Date.now();
      const pngFileName = `rivermeadow_diagram_${timestamp}.png`;
      const outputPath = path.join(pngDir, pngFileName);
      
      console.log(`Using direct SVG-to-PNG conversion for: ${baseFileName}`);
      
      // Get the SVG directly from our diagram-svg endpoint
      const baseUrl = `http://localhost:${process.env.PORT || 5000}`;
      // Try multiple possible diagram files with all potential extensions
      const possibleFiles = [
        `${baseFileName}.drawio`,
        `${baseFileName}.xml`,
        baseFileName
      ];
      
      let svgResponse = null;
      for (const file of possibleFiles) {
        try {
          console.log(`Attempting to get SVG from: ${file}`);
          const response = await fetch(`${baseUrl}/api/diagram-svg/${file}`);
          if (response.ok) {
            svgResponse = response;
            console.log(`Successfully retrieved SVG from: ${file}`);
            break;
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.log(`Error fetching SVG from ${file}: ${error.message}`);
        }
      }
      
      if (!svgResponse) {
        throw new Error('Could not get SVG content from any source');
      }
      
      const svgContent = await svgResponse.text();
      
      // Check if SVG is valid
      if (!svgContent.includes('<svg')) {
        throw new Error('SVG content does not contain <svg> tag');
      }
      
      // Create a temporary file with the SVG content
      const tempSvgPath = path.join(pngDir, `temp_${timestamp}.svg`);
      fs.writeFileSync(tempSvgPath, svgContent);
      console.log(`Wrote SVG content to temp file: ${tempSvgPath}`);
      
      try {
        // Use sharp to convert SVG to PNG with high quality settings
        await sharp(tempSvgPath, { 
          density: 300, // Higher density for better quality
          limitInputPixels: false // Allow large images
        })
        .resize({
          width: 2000, 
          height: 2000,
          fit: 'inside',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png({ quality: 100 })
        .toFile(outputPath);
        
        // Clean up temporary SVG file
        try {
          fs.unlinkSync(tempSvgPath);
        } catch (e) {
          console.error('Error removing temporary SVG file:', e);
        }
        
        console.log(`Successfully converted SVG to PNG: ${outputPath}`);
        
        // Send the file as an attachment with proper headers
        res.setHeader('Content-Disposition', `attachment; filename="${pngFileName}"`);
        res.setHeader('Content-Type', 'image/png');
        
        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);
        
      } catch (sharpError) {
        console.error('Error converting SVG to PNG:', sharpError);
        
        // Fallback to simple canvas-based PNG
        console.log('Creating simple canvas-based diagram as fallback');
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(1200, 800);
        const ctx = canvas.getContext('2d');
        
        // Fill with white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 1200, 800);
        
        // Add title
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('RiverMeadow Diagram', 600, 100);
        
        // Add watermark
        ctx.font = '14px Arial';
        ctx.fillStyle = '#888888';
        ctx.fillText('Generated by RiverMeadow Assistant', 600, 750);
        
        // Save to file
        const pngBuffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputPath, pngBuffer);
        
        // Send the file as an attachment
        res.setHeader('Content-Disposition', `attachment; filename="${pngFileName}"`);
        res.setHeader('Content-Type', 'image/png');
        
        const fileStream = fs.createReadStream(outputPath);
        fileStream.pipe(res);
      }
    } catch (error) {
      console.error('Error generating diagram PNG:', error);
      res.status(500).json({ 
        error: 'Failed to generate diagram PNG',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Endpoint for viewing diagram HTML file directly
  app.get('/api/diagram-png/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      
      // Verify the file exists and is an HTML file
      if (!fileName.endsWith('.html')) {
        return res.status(400).json({ error: 'Only HTML diagram files are supported' });
      }
      
      const htmlFilePath = path.join(process.cwd(), 'uploads', 'generated', fileName);
      
      if (!fs.existsSync(htmlFilePath)) {
        return res.status(404).json({ error: 'Diagram file not found' });
      }
      
      // Since puppeteer isn't working in this environment, we'll send the HTML file directly
      // with instructions for download
      const htmlContent = await fs.promises.readFile(htmlFilePath, 'utf-8');
      
      // Try to extract SVG from the HTML content (assuming it's a Mermaid diagram)
      const svgMatch = htmlContent.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
      const hasSvg = svgMatch && svgMatch[0];
      
      // Add download script to the HTML content to automatically save as HTML
      // The client can then open this HTML file locally to view the diagram
      const downloadScript = `
        <script>
          // Auto-download functionality
          window.onload = function() {
            // Add a prominent message at the top of the page
            const messageDiv = document.createElement('div');
            messageDiv.style.background = 'cornflowerblue';
            messageDiv.style.color = 'white';
            messageDiv.style.padding = '15px';
            messageDiv.style.textAlign = 'center';
            messageDiv.style.fontSize = '18px';
            messageDiv.style.fontWeight = 'bold';
            messageDiv.style.marginBottom = '20px';
            messageDiv.style.position = 'sticky';
            messageDiv.style.top = '0';
            messageDiv.style.zIndex = '1000';
            messageDiv.innerHTML = 'This is your RiverMeadow diagram. Choose from the options below:';
            document.body.insertBefore(messageDiv, document.body.firstChild);
            
            // Create a download HTML button
            const downloadHtmlButton = document.createElement('button');
            downloadHtmlButton.innerHTML = 'Save as HTML';
            downloadHtmlButton.style.background = '#0078d4';
            downloadHtmlButton.style.color = 'white';
            downloadHtmlButton.style.border = 'none';
            downloadHtmlButton.style.padding = '10px 20px';
            downloadHtmlButton.style.borderRadius = '5px';
            downloadHtmlButton.style.cursor = 'pointer';
            downloadHtmlButton.style.fontSize = '16px';
            downloadHtmlButton.style.fontWeight = 'bold';
            downloadHtmlButton.style.margin = '10px';
            downloadHtmlButton.style.display = 'inline-block';
            
            downloadHtmlButton.onclick = function() {
              const timestamp = Date.now();
              const a = document.createElement('a');
              a.href = window.location.href;
              a.download = 'rivermeadow_diagram_' + timestamp + '.html';
              a.click();
            };
            
            messageDiv.appendChild(downloadHtmlButton);
            
            // Create a download PNG button if SVG is available
            ${hasSvg ? `
            const downloadPngButton = document.createElement('button');
            downloadPngButton.innerHTML = 'Save as PNG';
            downloadPngButton.style.background = '#9a309a';
            downloadPngButton.style.color = 'white';
            downloadPngButton.style.border = 'none';
            downloadPngButton.style.padding = '10px 20px';
            downloadPngButton.style.borderRadius = '5px';
            downloadPngButton.style.cursor = 'pointer';
            downloadPngButton.style.fontSize = '16px';
            downloadPngButton.style.fontWeight = 'bold';
            downloadPngButton.style.margin = '10px';
            downloadPngButton.style.display = 'inline-block';
            
            downloadPngButton.onclick = function() {
              // Create a canvas to convert SVG to PNG
              const svgElement = document.querySelector('svg');
              if (svgElement) {
                try {
                  // Use html-to-image library which is more reliable than direct canvas
                  // We'll use toBlob which works better across browsers
                  const tempImg = document.createElement('img');
                  const svgData = new XMLSerializer().serializeToString(svgElement);
                  const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
                  const url = URL.createObjectURL(svgBlob);
                  
                  tempImg.onload = function() {
                    // Create canvas with improved quality
                    const canvas = document.createElement('canvas');
                    // Use 2x the SVG size for better quality
                    canvas.width = svgElement.viewBox.baseVal.width * 2 || tempImg.width * 2;
                    canvas.height = svgElement.viewBox.baseVal.height * 2 || tempImg.height * 2;
                    
                    const ctx = canvas.getContext('2d');
                    // Use higher quality settings
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.scale(2, 2); // Scale up for better quality
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(tempImg, 0, 0);
                    
                    // Create download link
                    canvas.toBlob(function(blob) {
                      const imgUrl = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = imgUrl;
                      a.download = 'rivermeadow_diagram_' + Date.now() + '.png';
                      a.click();
                      URL.revokeObjectURL(imgUrl);
                    }, 'image/png');
                  };
                  
                  tempImg.src = url;
                } catch (e) {
                  console.error('Error saving as PNG:', e);
                  alert('Could not save as PNG. Please try the HTML option instead.');
                }
              }
            };
            
            messageDiv.appendChild(downloadPngButton);
            ` : ''}
            
            // Add print button
            const printButton = document.createElement('button');
            printButton.innerHTML = 'Print Diagram';
            printButton.style.background = '#107c10';
            printButton.style.color = 'white';
            printButton.style.border = 'none';
            printButton.style.padding = '10px 20px';
            printButton.style.borderRadius = '5px';
            printButton.style.cursor = 'pointer';
            printButton.style.fontSize = '16px';
            printButton.style.fontWeight = 'bold';
            printButton.style.margin = '10px';
            printButton.style.display = 'inline-block';
            
            printButton.onclick = function() {
              window.print();
            };
            
            messageDiv.appendChild(printButton);
            
            // Make diagram container white for better printing
            const container = document.querySelector('.diagram-container');
            if (container) {
              container.style.background = 'white';
              container.style.maxWidth = 'none';
              container.style.width = '100%';
              container.style.boxShadow = 'none';
              container.style.marginTop = '20px';
            }
            
            // Make overall body style more suitable for diagram viewing
            document.body.style.background = '#f5f5f5';
            document.body.style.padding = '20px';
            document.body.style.margin = '0';
            document.body.style.fontFamily = 'Arial, sans-serif';
            
            // Add credits
            const creditsDiv = document.createElement('div');
            creditsDiv.style.marginTop = '30px';
            creditsDiv.style.textAlign = 'center';
            creditsDiv.style.color = '#666';
            creditsDiv.style.fontSize = '14px';
            creditsDiv.innerHTML = 'Generated by RiverMeadow AI Assistant';
            document.body.appendChild(creditsDiv);
          };
        </script>
      `;
      
      // Insert the download script right before the </body> tag
      const modifiedHtml = htmlContent.replace('</body>', `${downloadScript}</body>`);
      
      // Create a public URL for the diagram instead of direct download
      // User can view the diagram in browser and save it manually
      
      // Copy the modified HTML to a public folder with a unique name
      const publicDiagramsDir = path.join(process.cwd(), 'public', 'diagrams');
      if (!fs.existsSync(publicDiagramsDir)) {
        await fs.promises.mkdir(publicDiagramsDir, { recursive: true });
      }
      
      const timestamp = Date.now();
      const publicFileName = `rivermeadow_diagram_${timestamp}.html`;
      const publicFilePath = path.join(publicDiagramsDir, publicFileName);
      
      // Write the modified HTML to the public folder
      await fs.promises.writeFile(publicFilePath, modifiedHtml);
      
      // Redirect to the public URL
      const publicUrl = `/diagrams/${publicFileName}`;
      res.redirect(publicUrl);
    } catch (error) {
      console.error('Error generating diagram HTML for download:', error);
      res.status(500).json({ error: 'Failed to generate diagram HTML' });
    }
  });
  
  // Convert mermaid file to PNG using mmdc
  app.get('/api/convert-mermaid-to-png/:fileName', async (req: Request, res: Response) => {
    try {
      const mmdFileName = req.params.fileName;
      
      // Verify the file exists and has .mmd extension
      if (!mmdFileName.endsWith('.mmd')) {
        return res.status(400).json({ error: 'Only .mmd files are supported' });
      }
      
      const mmdFilePath = path.join(process.cwd(), 'uploads', 'generated', mmdFileName);
      
      if (!fs.existsSync(mmdFilePath)) {
        return res.status(404).json({ error: 'Mermaid file not found' });
      }
      
      console.log(`Converting mermaid file to PNG: ${mmdFileName}`);
      
      // Create directory for PNG outputs if it doesn't exist
      const pngDir = path.join(process.cwd(), 'uploads', 'png');
      if (!fs.existsSync(pngDir)) {
        await fs.promises.mkdir(pngDir, { recursive: true });
      }
      
      // Find the matching HTML file for this diagram
      // The MMD file should have a matching HTML file with same base name but .html extension
      const baseFileName = mmdFileName.replace('.mmd', '');
      const htmlFileName = baseFileName + '.html';
      const htmlFilePath = path.join(process.cwd(), 'uploads', 'generated', htmlFileName);
      
      // Check if HTML file exists
      if (fs.existsSync(htmlFilePath)) {
        console.log(`Found matching HTML file: ${htmlFileName}`);
        
        try {
          // Try to use mmdc command to convert mermaid to PNG
          console.log(`Attempting to convert using mmdc...`);
          
          // Generate output PNG filename
          const timestamp = Date.now();
          const pngFileName = `diagram_${timestamp}.png`;
          const pngFilePath = path.join(pngDir, pngFileName);
          
          let pngGenerated = false;
          
          try {
            // Attempt to execute mmdc command with a timeout of 10 seconds
            await new Promise<void>((resolve, reject) => {
              const cmd = `./node_modules/.bin/mmdc -i ${mmdFilePath} -o ${pngFilePath} -b white -w 1024 --puppeteerConfigFile puppeteer-config.json`;
              console.log(`Running command: ${cmd}`);
              
              const execProcess = exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
                if (error) {
                  console.error(`Error executing mmdc: ${error.message}`);
                  console.error(`stderr: ${stderr}`);
                  reject(error);
                  return;
                }
                
                console.log(`mmdc output: ${stdout}`);
                resolve();
              });
            });
            
            // Check if PNG was created successfully
            if (fs.existsSync(pngFilePath)) {
              pngGenerated = true;
              // Set headers for file download
              res.setHeader('Content-Type', 'image/png');
              res.setHeader('Content-Disposition', `attachment; filename="${pngFileName}"`);
              
              // Stream the file to client
              fs.createReadStream(pngFilePath).pipe(res);
            }
          } catch (mmcdError) {
            console.error('mmdc conversion failed, will redirect to HTML version:', mmcdError);
            pngGenerated = false;
          }
          
          if (!pngGenerated) {
            // Redirect to the HTML version if PNG generation failed
            console.log('PNG generation failed, redirecting to HTML version');
            return res.redirect(`/uploads/generated/${htmlFileName}`);
          }
        } catch (error) {
          console.error('Error in PNG conversion process:', error);
          // Redirect to the HTML version if any part of the process failed
          return res.redirect(`/uploads/generated/${htmlFileName}`);
        }
      } else {
        // If HTML file doesn't exist, return an error
        console.error(`No matching HTML file found for ${mmdFileName}`);
        return res.status(404).json({ 
          error: 'No matching HTML file found for this mermaid diagram',
          htmlPath: `/uploads/generated/${htmlFileName}`
        });
      }
    } catch (error) {
      console.error('Error converting mermaid to PNG:', error);
      return res.status(500).json({ 
        error: 'Failed to convert mermaid diagram to PNG',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Chat management endpoints
  app.get('/api/chats', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const chats = await storage.getUserChats(req.user.id);
      res.json(chats);
    } catch (error) {
      console.error('Error retrieving user chats:', error);
      res.status(500).json({ message: 'Failed to retrieve chats' });
    }
  });
  
  app.post('/api/chats', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const { title } = req.body;
      const newChat = await storage.createChat({
        userId: req.user.id,
        title: title || 'New Conversation'
      });
      
      res.status(201).json(newChat);
    } catch (error) {
      console.error('Error creating chat:', error);
      res.status(500).json({ message: 'Failed to create chat' });
    }
  });
  
  app.get('/api/chats/:id', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }
      
      // Verify the chat belongs to the current user
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      res.json(chat);
    } catch (error) {
      console.error('Error retrieving chat:', error);
      res.status(500).json({ message: 'Failed to retrieve chat' });
    }
  });
  
  app.patch('/api/chats/:id', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }
      
      // Verify the chat belongs to the current user
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const { title } = req.body;
      const updatedChat = await storage.updateChatTitle(chatId, title);
      
      res.json(updatedChat);
    } catch (error) {
      console.error('Error updating chat:', error);
      res.status(500).json({ message: 'Failed to update chat' });
    }
  });
  
  app.delete('/api/chats/:id', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }
      
      // Verify the chat belongs to the current user
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      await storage.deleteChat(chatId);
      
      res.status(204).end();
    } catch (error) {
      console.error('Error deleting chat:', error);
      res.status(500).json({ message: 'Failed to delete chat' });
    }
  });
  
  // Chat messages endpoints
  app.get('/api/chats/:id/messages', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }
      
      // Verify the chat belongs to the current user
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const messages = await storage.getChatMessages(chatId);
      res.json(messages);
    } catch (error) {
      console.error('Error retrieving chat messages:', error);
      res.status(500).json({ message: 'Failed to retrieve chat messages' });
    }
  });
  
  app.post('/api/chats/:id/messages', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }
      
      // Verify the chat belongs to the current user
      if (chat.userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const { content, role, references } = req.body;
      const newMessage = await storage.createChatMessage({
        chatId,
        content,
        role,
        references
      });
      
      // Check if this is the first user message in the chat and update the chat title if needed
      if (role === 'user') {
        const existingMessages = await storage.getChatMessages(chatId);
        if (existingMessages.length <= 1) { // This is the first or second message (including the one we just added)
          // Generate a title from the user's first message (using first 5-6 words or 40 chars max)
          let newTitle = content.trim();
          
          // Limit to first 5-6 words or 40 chars
          if (newTitle.length > 40) {
            newTitle = newTitle.substring(0, 40).trim() + '...';
          } else {
            const words = newTitle.split(' ');
            if (words.length > 6) {
              newTitle = words.slice(0, 5).join(' ') + '...';
            }
          }
          
          // Only update if the title is still "New Conversation"
          if (chat.title === 'New Conversation') {
            await storage.updateChatTitle(chatId, newTitle);
          }
        }
      }
      
      res.status(201).json(newMessage);
    } catch (error) {
      console.error('Error creating chat message:', error);
      res.status(500).json({ message: 'Failed to create chat message' });
    }
  });

  // Admin API endpoints for user management
  const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // First check for token-based authentication
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const user = await verifyAuthToken(token);
        
        if (user) {
          // Token is valid, set the user on the request
          req.user = user;
          
          // Check if user has admin role
          if (user.role !== 'admin' && user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Not authorized - admin access required' });
          }
          
          return next();
        }
      }
      
      // Fall back to session-based authentication
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      
      const user = req.user as User;
      if (user.role !== 'admin' && user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Not authorized - admin access required' });
      }
      
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({ message: 'Authentication error' });
    }
  };
  
  const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // First check for token-based authentication
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const user = await verifyAuthToken(token);
        
        if (user) {
          // Token is valid, set the user on the request
          req.user = user;
          
          // Check if user has superadmin role
          if (user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Not authorized - superadmin access required' });
          }
          
          return next();
        }
      }
      
      // Fall back to session-based authentication
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      
      const user = req.user as User;
      if (user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Not authorized - superadmin access required' });
      }
      
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({ message: 'Authentication error' });
    }
  };
  
  // Get all users (admin only)
  app.get('/api/admin/users', requireAdmin, async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });
  
  // Create a new user (admin only)
  app.post('/api/admin/users', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { username, password, name, role } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
      }
      
      // Only superadmin can create another admin/superadmin
      if ((role === 'admin' || role === 'superadmin') && (req.user as User).role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmins can create admin accounts' });
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
      }
      
      // Hash the password
      const hashedPassword = await hashPassword(password);
      
      // Create the user
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name: name || null,
        role: role || 'user',
        email: req.body.email || null
      });
      
      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Failed to create user' });
    }
  });
  
  // Delete a user (admin only)
  app.delete('/api/admin/users/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      
      // Check if user exists
      const userToDelete = await storage.getUser(userId);
      if (!userToDelete) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Only superadmin can delete an admin
      if (userToDelete.role === 'admin' && (req.user as User).role !== 'superadmin') {
        return res.status(403).json({ message: 'Only superadmins can delete admin accounts' });
      }
      
      // Prevent superadmin from being deleted
      if (userToDelete.role === 'superadmin') {
        return res.status(403).json({ message: 'Cannot delete superadmin user' });
      }
      
      // Prevent self-deletion
      const currentUser = req.user as User;
      if (userId === currentUser.id) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }
      
      // Delete the user
      await storage.deleteUser(userId);
      
      res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Failed to delete user' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
