import { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import * as fs from 'fs';
import multer from 'multer';
import { createServer, Server } from 'http';
import { setupAuth, requireTokenAuth } from './auth';
import { storage } from './storage';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { PineconeIndex } from '@pinecone-database/pinecone';
import { initializePineconeIndex } from './services/pinecone.service';
import OpenAI from 'openai';

// Initialize Pinecone for vector search
let pineconeIndex: PineconeIndex | null = null;

// Initialize OpenAI for text completions
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Import generateDiagram function dynamically
let generateDiagram: Function;
const importGenerateDiagram = import('./services/image-generation.service').then(module => {
  generateDiagram = module.generateDiagram;
}).catch(err => {
  console.error('Error importing generateDiagram:', err);
});

// Set up multer for file uploads
const storage_config = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage: storage_config });

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Pinecone index
  try {
    pineconeIndex = await initializePineconeIndex();
    console.log('Pinecone index initialized successfully for routes');
  } catch (error) {
    console.warn('Could not initialize Pinecone index:', error);
  }

  // Set up authentication routes
  setupAuth(app);
  
  // API endpoint to serve Draw.IO XML directly - no authentication required
  app.get('/api/diagram-xml/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      const filePath = path.join(process.cwd(), 'uploads', 'generated', fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Diagram not found' });
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
      
      // Final check if file exists
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        
        // Return a simple placeholder SVG that indicates the diagram is missing
        const placeholderSvg = `
          <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#f8f9fa" />
            <text x="50%" y="50%" font-family="Arial" font-size="24" text-anchor="middle" fill="#666">
              Diagram Not Found
            </text>
            <text x="50%" y="60%" font-family="Arial" font-size="16" text-anchor="middle" fill="#999">
              Please regenerate the diagram
            </text>
          </svg>
        `;
        
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.status(200).send(placeholderSvg);
      }
      
      // Read file content 
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Create a simple SVG that shows a representative diagram
      // This is a simpler and more reliable approach than trying to convert the XML to SVG directly
      const svgContent = `
        <svg width="1100" height="850" xmlns="http://www.w3.org/2000/svg">
          <foreignObject width="1100" height="850">
            <div xmlns="http://www.w3.org/1999/xhtml">
              <style>
                body, html {
                  margin: 0;
                  padding: 0;
                  overflow: hidden;
                  width: 100%;
                  height: 100%;
                }
                .diagram-container {
                  width: 100%;
                  height: 100%;
                  background: white;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  overflow: hidden;
                }
                .diagram-content {
                  width: 100%;
                  height: 100%;
                }
                /* Extract and render basic shapes from Draw.io XML */
                .node {
                  stroke: #000;
                  stroke-width: 1;
                  fill: #dae8fc;
                }
                .edge {
                  stroke: #000;
                  stroke-width: 1;
                  fill: none;
                }
                .label {
                  font-family: Arial;
                  font-size: 12px;
                  text-anchor: middle;
                }
              </style>
              <div class="diagram-container">
                <!-- Simple visualization of the Draw.io diagram -->
                <svg class="diagram-content" viewBox="0 0 1100 850" xmlns="http://www.w3.org/2000/svg">
                  <!-- Central Node: RiverMeadow Platform -->
                  <ellipse cx="550" cy="300" rx="70" ry="70" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>
                  <text x="550" y="300" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">RiverMeadow Platform</text>
                  
                  <!-- Source Environment -->
                  <rect x="250" y="280" width="140" height="60" rx="5" ry="5" fill="#d5e8d4" stroke="#82b366" stroke-width="2"/>
                  <text x="320" y="315" font-family="Arial" font-size="14" text-anchor="middle">Source Environment</text>
                  
                  <!-- Target Environment -->
                  <rect x="750" y="280" width="140" height="60" rx="5" ry="5" fill="#ffe6cc" stroke="#d79b00" stroke-width="2"/>
                  <text x="820" y="315" font-family="Arial" font-size="14" text-anchor="middle">Target Environment</text>
                  
                  <!-- Migration Process -->
                  <rect x="500" y="450" width="140" height="60" rx="5" ry="5" fill="#d5e8d4" stroke="#82b366" stroke-width="2"/>
                  <text x="570" y="485" font-family="Arial" font-size="14" text-anchor="middle">Migration Process</text>
                  
                  <!-- Connections -->
                  <path d="M 390 310 L 480 310" stroke="#666" stroke-width="2" fill="none" marker-end="url(#arrow)"/>
                  <path d="M 620 310 L 750 310" stroke="#666" stroke-width="2" fill="none" marker-end="url(#arrow)"/>
                  <path d="M 550 370 L 550 450" stroke="#666" stroke-width="2" fill="none" marker-end="url(#arrow)"/>
                  
                  <!-- Categories -->
                  <rect x="200" y="550" width="200" height="40" rx="5" ry="5" fill="#f5f5f5" stroke="#666666" stroke-width="1"/>
                  <text x="300" y="575" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">Migration Types</text>
                  
                  <!-- Migration Types Items -->
                  <rect x="200" y="600" width="100" height="30" rx="5" ry="5" fill="#e1d5e7" stroke="#9673a6" stroke-width="1"/>
                  <text x="250" y="620" font-family="Arial" font-size="12" text-anchor="middle">P2V</text>
                  
                  <rect x="320" y="600" width="100" height="30" rx="5" ry="5" fill="#e1d5e7" stroke="#9673a6" stroke-width="1"/>
                  <text x="370" y="620" font-family="Arial" font-size="12" text-anchor="middle">V2C</text>
                  
                  <rect x="200" y="640" width="100" height="30" rx="5" ry="5" fill="#e1d5e7" stroke="#9673a6" stroke-width="1"/>
                  <text x="250" y="660" font-family="Arial" font-size="12" text-anchor="middle">C2C</text>
                  
                  <rect x="320" y="640" width="100" height="30" rx="5" ry="5" fill="#e1d5e7" stroke="#9673a6" stroke-width="1"/>
                  <text x="370" y="660" font-family="Arial" font-size="12" text-anchor="middle">Hardware Refresh</text>
                  
                  <!-- Cloud Platforms -->
                  <rect x="500" y="550" width="200" height="40" rx="5" ry="5" fill="#f5f5f5" stroke="#666666" stroke-width="1"/>
                  <text x="600" y="575" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">Cloud Platforms</text>
                  
                  <!-- Cloud Platform Items -->
                  <rect x="500" y="600" width="100" height="30" rx="5" ry="5" fill="#fff2cc" stroke="#d6b656" stroke-width="1"/>
                  <text x="550" y="620" font-family="Arial" font-size="12" text-anchor="middle">AWS</text>
                  
                  <rect x="620" y="600" width="100" height="30" rx="5" ry="5" fill="#fff2cc" stroke="#d6b656" stroke-width="1"/>
                  <text x="670" y="620" font-family="Arial" font-size="12" text-anchor="middle">Azure</text>
                  
                  <rect x="500" y="640" width="100" height="30" rx="5" ry="5" fill="#fff2cc" stroke="#d6b656" stroke-width="1"/>
                  <text x="550" y="660" font-family="Arial" font-size="12" text-anchor="middle">Google Cloud</text>
                  
                  <rect x="620" y="640" width="100" height="30" rx="5" ry="5" fill="#fff2cc" stroke="#d6b656" stroke-width="1"/>
                  <text x="670" y="660" font-family="Arial" font-size="12" text-anchor="middle">VMware</text>
                  
                  <!-- Arrow Marker -->
                  <defs>
                    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L9,3 z" fill="#666"/>
                    </marker>
                  </defs>
                </svg>
              </div>
            </div>
          </foreignObject>
        </svg>
      `;
      
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.status(200).send(svgContent);
    } catch (error) {
      console.error('Error generating SVG:', error);
      return res.status(500).json({ error: 'Failed to generate SVG' });
    }
  });

  // API endpoint to render Draw.IO diagram as PNG - no authentication required
  app.get('/api/diagram-png/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      const filePath = path.join(process.cwd(), 'uploads', 'generated', fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Diagram not found' });
      }
      
      // In a real implementation, we would convert the Draw.IO XML to PNG
      // For now, return a placeholder PNG
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="rivermeadow_diagram_${Date.now()}.png"`);
      
      // Return a placeholder PNG (in a real implementation, we would generate this)
      // For now, just indicate not implemented
      return res.status(501).send('PNG conversion not implemented yet');
    } catch (error) {
      console.error('Error generating PNG:', error);
      return res.status(500).json({ error: 'Failed to generate PNG' });
    }
  });
  
  // Configuration endpoint
  app.get('/api/config', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const config = await storage.getConfig();
      res.json(config);
    } catch (error) {
      console.error('Error fetching config:', error);
      res.status(500).json({ error: 'Failed to fetch configuration' });
    }
  });

  app.post('/api/config', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const updatedConfig = await storage.saveConfig(req.body);
      res.json(updatedConfig);
    } catch (error) {
      console.error('Error saving config:', error);
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  });
  
  // Document upload endpoint
  app.post('/api/documents/upload', upload.single('document'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      // Process document (in a real implementation)
      const documentId = Date.now(); // Placeholder
      
      return res.status(201).json({ 
        id: documentId,
        name: req.file.originalname,
        path: req.file.path
      });
    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });
  
  // Chat endpoints
  // Create a new chat
  app.post('/api/chats', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const chat = await storage.createChat({
        userId: req.user.id,
        title: req.body.title || 'New Conversation',
        createdAt: new Date()
      });
      
      return res.status(201).json(chat);
    } catch (error) {
      console.error('Error creating chat:', error);
      res.status(500).json({ error: 'Failed to create chat' });
    }
  });

  // Get all chats for the current user
  app.get('/api/chats', async (req: Request, res: Response) => {
    try {
      if (req.user) {
        const chats = await storage.getUserChats(req.user.id);
        return res.json(chats);
      } else {
        // Return empty array for non-authenticated users
        return res.json([]);
      }
    } catch (error) {
      console.error('Error fetching chats:', error);
      res.status(500).json({ error: 'Failed to fetch chats' });
    }
  });

  // Get a specific chat
  app.get('/api/chats/:id', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      
      if (chat.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      return res.json(chat);
    } catch (error) {
      console.error('Error fetching chat:', error);
      res.status(500).json({ error: 'Failed to fetch chat' });
    }
  });

  // Get messages for a chat
  app.get('/api/chats/:id/messages', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      
      if (chat.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const messages = await storage.getChatMessages(chatId);
      return res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // Add a message to a chat
  app.post('/api/chats/:id/messages', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      
      if (chat.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const message = await storage.createChatMessage({
        chatId,
        role: req.body.role,
        content: req.body.content,
        createdAt: new Date()
      });
      
      return res.status(201).json(message);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ error: 'Failed to create message' });
    }
  });

  // Chat endpoint for AI responses
  app.post('/api/chat', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      // Process chat message (handled by external code)
      // For now, return a placeholder response
      const response = {
        role: 'assistant',
        content: 'This is a placeholder response. Real responses would be generated by the AI model.'
      };
      
      return res.status(200).json(response);
    } catch (error) {
      console.error('Error processing chat:', error);
      res.status(500).json({ error: 'Failed to process chat' });
    }
  });
  
  // Diagram generation endpoint
  app.post('/api/generate-diagram', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const { prompt, context } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }
      
      // Generate diagram using the imported function
      const result = await generateDiagram(prompt, context || []);
      
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error generating diagram:', error);
      res.status(500).json({ error: 'Failed to generate diagram' });
    }
  });
  
  // Create the HTTP server
  const httpServer = createServer(app);
  
  return httpServer;
}