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

  const httpServer = createServer(app);

  return httpServer;
}
