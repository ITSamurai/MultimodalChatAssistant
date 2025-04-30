import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { processDocument, getDocumentData } from "./services/document.service";
import { processMessage } from "./services/openai.service";
import { chatMessageSchema, insertMessageSchema } from "@shared/schema";
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
import { setupAuth, requireTokenAuth } from './auth';

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
      
      // If fileName ends with .xml but .xml doesn't exist, try without .xml extension
      if (fileName.endsWith('.xml') && !fs.existsSync(filePath)) {
        const baseFileName = fileName.slice(0, -4);
        const alternateFilePath = path.join(process.cwd(), 'uploads', 'generated', baseFileName);
        
        if (fs.existsSync(alternateFilePath)) {
          console.log(`File not found at ${filePath}, using alternate path: ${alternateFilePath}`);
          filePath = alternateFilePath;
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
      
      // Create a simple HTML page with the Draw.IO viewer
      const svgHtml = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>RiverMeadow Diagram</title>
        <style>
          body { margin: 0; padding: 0; overflow: hidden; }
          svg { width: 100%; height: 100%; }
          #error-message { 
            display: none; 
            position: absolute; 
            top: 50%; 
            left: 50%; 
            transform: translate(-50%, -50%);
            background: #fff; 
            padding: 20px; 
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
          }
        </style>
        <script src="https://viewer.diagrams.net/js/viewer.min.js"></script>
      </head>
      <body>
        <div id="diagram" style="width:100%;height:100%;"></div>
        <div id="error-message">
          <h3>Error Loading Diagram</h3>
          <p>The diagram could not be loaded.</p>
        </div>
        <script>
          // Function to parse and clean XML
          function parseAndCleanXML(xml) {
            // Remove any nested XML declarations
            xml = xml.replace(/<\\?xml[^>]*\\?>/g, '');
            
            // Handle nested mxGraphModel elements
            const regex = /<mxGraphModel[^>]*>([\\s\\S]*?)<\\/mxGraphModel>/g;
            const matches = [...xml.matchAll(regex)];
            
            if (matches.length > 1) {
              // If there are multiple mxGraphModel elements, keep only the first one
              const firstMatch = matches[0];
              xml = xml.replace(regex, '');
              xml = xml.replace('<root>', '<root>' + firstMatch[0]);
            }
            
            return xml;
          }
          
          try {
            // Get the XML content and clean it
            let graphXml = \`${cleanedContent.replace(/`/g, '\\`')}\`;
            
            // Parse and clean the XML
            graphXml = parseAndCleanXML(graphXml);
            
            // Initialize the Draw.IO viewer with the XML
            new GraphViewer({
              highlight: '#0000ff',
              nav: true,
              lightbox: false,
              edit: false,
              resize: false,
              toolbar: false,
              zoom: 1
            }, document.getElementById('diagram'));
            
            GraphViewer.processElements();
            
            // Handle messages from parent window (for zoom)
            window.addEventListener('message', function(event) {
              if (event.data && event.data.action === 'zoom') {
                // Handle zoom action if needed
                console.log('Zoom request received:', event.data.scale);
              }
            });
          } catch (e) {
            console.error('Error initializing diagram viewer:', e);
            document.getElementById('error-message').style.display = 'block';
          }
        </script>
      </body>
      </html>`;
      
      // Set the content type to HTML
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(svgHtml);
    } catch (error) {
      console.error('Error rendering diagram as SVG:', error);
      
      // Return a simple error SVG
      const errorSvg = `
        <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#fff0f0" />
          <text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle" fill="#d32f2f">
            Error Loading Diagram
          </text>
          <text x="50%" y="60%" font-family="Arial" font-size="14" text-anchor="middle" fill="#d32f2f">
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
      
      // Create a SVG directly from the XML content using the mxgraph library
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Create simple SVG placeholder until we can render properly
      const svgPlaceholder = `
      <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f8f9fa" />
        <text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle">
          Draw.IO Diagram
        </text>
        <text x="50%" y="60%" font-family="Arial" font-size="14" text-anchor="middle">
          Click to download and view in diagrams.net
        </text>
      </svg>
      `;
      
      // Set the content type
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      return res.status(200).send(svgPlaceholder);
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
      
      // Generate the diagram
      const result = await generateDiagram(prompt, context);
      
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
      
      // Make sure the file exists and is a HTML file to prevent security issues
      const htmlDirPath = path.join('uploads', 'generated');
      const htmlFilePath = path.join(htmlDirPath, fileName);
      
      if (!fs.existsSync(htmlFilePath) || !fileName.endsWith('.html')) {
        return res.status(404).json({ error: 'Diagram not found or invalid type' });
      }
      
      // Create uploads/png directory if it doesn't exist
      const pngDir = path.join('uploads', 'png');
      if (!fs.existsSync(pngDir)) {
        fs.mkdirSync(pngDir, { recursive: true });
      }
      
      // Generate a unique filename
      const timestamp = Date.now();
      const pngFileName = `diagram_${timestamp}.png`;
      const outputPath = path.join(pngDir, pngFileName);
      
      // Read the HTML file
      const htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
      
      // For Mermaid diagrams, extract the Mermaid code directly
      const mermaidMatch = htmlContent.match(/<div class="mermaid">\s*([\s\S]*?)<\/div>/);
      
      if (!mermaidMatch || !mermaidMatch[1]) {
        return res.status(400).json({ error: 'No Mermaid diagram code found in the HTML file' });
      }
      
      const mermaidCode = mermaidMatch[1].trim();
      
      // Use Puppeteer for better screenshot quality
      const browser = await puppeteer.launch({
        headless: true, // Use boolean instead of 'new' string
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
        
        // Load the HTML file directly
        const fullHtmlPath = path.resolve(htmlFilePath);
        await page.goto(`file://${fullHtmlPath}`, { 
          waitUntil: ['load', 'networkidle0']
        });
        
        // Wait a bit for Mermaid to fully render
        await page.waitForSelector('.mermaid svg', { timeout: 5000 });
        
        // Add inline CSS instead of modifying DOM elements directly
        // This avoids TypeScript errors with DOM manipulation
        await page.addStyleTag({
          content: `
            body {
              margin: 0;
              padding: 0;
              overflow: visible;
            }
            .diagram-container {
              max-width: none !important;
              width: 2400px !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 40px !important;
              box-shadow: none !important;
            }
            .mermaid svg {
              max-width: none !important;
              width: 100% !important;
              height: auto !important;
            }
          `
        });
        
        // Wait a moment for style changes to take effect
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Take a screenshot of the diagram container
        const diagramElement = await page.$('.diagram-container');
        if (!diagramElement) {
          throw new Error('Diagram container not found');
        }
        
        const screenshot = await diagramElement.screenshot({
          type: 'png',
          omitBackground: false,
          captureBeyondViewport: true,
          path: outputPath
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

  const httpServer = createServer(app);

  return httpServer;
}
