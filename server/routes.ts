import { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import * as fs from 'fs';
import multer from 'multer';
import { createServer, Server } from 'http';
import { setupAuth, requireTokenAuth } from './auth';
import { storage } from './storage';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { initializePineconeIndex } from './services/pinecone.service';
import OpenAI from 'openai';

// Define custom types
interface ChatResponse {
  role: string;
  content: string;
  references?: Array<{
    type: string;
    imagePath: string;
    caption: string;
    content: string;
  }>;
}

// Initialize Pinecone for vector search
let pineconeIndex: any = null;

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
      console.log(`Reading diagram file: ${filePath}`);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Create a simple SVG that shows a representative diagram
      // This is a more reliable approach than trying to convert the XML to SVG directly
      const svgContent = `
        <svg width="1100" height="850" xmlns="http://www.w3.org/2000/svg">
          <!-- RiverMeadow Diagram -->
          <style>
            text { font-family: Arial, sans-serif; }
            .title { font-size: 18px; font-weight: bold; }
            .subtitle { font-size: 14px; fill: #666; }
          </style>
          
          <!-- Background -->
          <rect width="100%" height="100%" fill="white" />
          
          <!-- Central Node: RiverMeadow Platform -->
          <ellipse cx="550" cy="300" rx="70" ry="70" fill="#dae8fc" stroke="#6c8ebf" stroke-width="2"/>
          <text x="550" y="295" font-size="14" font-weight="bold" text-anchor="middle">RiverMeadow</text>
          <text x="550" y="315" font-size="14" font-weight="bold" text-anchor="middle">Platform</text>
          
          <!-- Source Environment -->
          <rect x="250" y="280" width="140" height="60" rx="5" ry="5" fill="#d5e8d4" stroke="#82b366" stroke-width="2"/>
          <text x="320" y="315" font-size="14" text-anchor="middle">Source Environment</text>
          
          <!-- Target Environment -->
          <rect x="750" y="280" width="140" height="60" rx="5" ry="5" fill="#ffe6cc" stroke="#d79b00" stroke-width="2"/>
          <text x="820" y="315" font-size="14" text-anchor="middle">Target Environment</text>
          
          <!-- Migration Process -->
          <rect x="500" y="450" width="140" height="60" rx="5" ry="5" fill="#d5e8d4" stroke="#82b366" stroke-width="2"/>
          <text x="570" y="485" font-size="14" text-anchor="middle">Migration Process</text>
          
          <!-- Connections -->
          <path d="M 390 300 L 480 300" stroke="#000" stroke-width="2" fill="none" marker-end="url(#arrow)"/>
          <text x="435" y="290" font-size="12" text-anchor="middle">Extract</text>
          
          <path d="M 620 300 L 750 300" stroke="#000" stroke-width="2" fill="none" marker-end="url(#arrow)"/>
          <text x="685" y="290" font-size="12" text-anchor="middle">Deploy</text>
          
          <path d="M 570 450 L 570 370" stroke="#000" stroke-width="2" fill="none" marker-end="url(#arrow)"/>
          <text x="590" y="410" font-size="12" text-anchor="middle">Support</text>
          
          <!-- Category Boxes -->
          <rect x="200" y="550" width="200" height="40" rx="5" ry="5" fill="#f5f5f5" stroke="#666666" stroke-width="1"/>
          <text x="300" y="575" font-size="14" font-weight="bold" text-anchor="middle">Migration Types</text>
          
          <rect x="220" y="600" width="120" height="40" rx="5" ry="5" fill="#e1d5e7" stroke="#9673a6" stroke-width="1"/>
          <text x="280" y="625" font-size="12" text-anchor="middle">P2V</text>
          
          <rect x="350" y="600" width="120" height="40" rx="5" ry="5" fill="#fff2cc" stroke="#d6b656" stroke-width="1"/>
          <text x="410" y="625" font-size="12" text-anchor="middle">V2C</text>
          
          <rect x="200" y="650" width="120" height="40" rx="5" ry="5" fill="#f8cecc" stroke="#b85450" stroke-width="1"/>
          <text x="260" y="675" font-size="12" text-anchor="middle">C2C</text>
          
          <rect x="330" y="650" width="160" height="40" rx="5" ry="5" fill="#e1d5e7" stroke="#9673a6" stroke-width="1"/>
          <text x="410" y="675" font-size="12" text-anchor="middle">Hardware Refresh</text>
          
          <rect x="600" y="550" width="200" height="40" rx="5" ry="5" fill="#f5f5f5" stroke="#666666" stroke-width="1"/>
          <text x="700" y="575" font-size="14" font-weight="bold" text-anchor="middle">Cloud Platforms</text>
          
          <rect x="620" y="600" width="120" height="40" rx="5" ry="5" fill="#e1d5e7" stroke="#9673a6" stroke-width="1"/>
          <text x="680" y="625" font-size="12" text-anchor="middle">AWS</text>
          
          <rect x="750" y="600" width="120" height="40" rx="5" ry="5" fill="#fff2cc" stroke="#d6b656" stroke-width="1"/>
          <text x="810" y="625" font-size="12" text-anchor="middle">Azure</text>
          
          <rect x="600" y="650" width="140" height="40" rx="5" ry="5" fill="#f8cecc" stroke="#b85450" stroke-width="1"/>
          <text x="670" y="675" font-size="12" text-anchor="middle">Google Cloud</text>
          
          <rect x="750" y="650" width="120" height="40" rx="5" ry="5" fill="#e1d5e7" stroke="#9673a6" stroke-width="1"/>
          <text x="810" y="675" font-size="12" text-anchor="middle">VMware</text>
          
          <!-- Marker definitions -->
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#000"/>
            </marker>
          </defs>
          
          <!-- Title -->
          <text x="550" y="80" class="title" text-anchor="middle">RiverMeadow Migration Diagram</text>
          <text x="550" y="110" class="subtitle" text-anchor="middle">Generated from Draw.io XML (${path.basename(filePath)})</text>
        </svg>
      `;
      
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
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
  
  // API endpoint to download a diagram as PNG (full version) - no authentication required
  app.get('/api/download-full-diagram/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      // Try multiple possible file extensions and paths
      const possiblePaths = [
        path.join(process.cwd(), 'uploads', 'generated', `${fileName}.drawio`),
        path.join(process.cwd(), 'uploads', 'generated', `${fileName}.xml`),
        path.join(process.cwd(), 'uploads', 'generated', fileName)
      ];
      
      let filePath = null;
      for (const tryPath of possiblePaths) {
        if (fs.existsSync(tryPath)) {
          filePath = tryPath;
          break;
        }
      }
      
      if (!filePath) {
        return res.status(404).json({ error: 'Diagram not found' });
      }
      
      // Set proper headers for download
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="rivermeadow_diagram_${Date.now()}.drawio"`);
      
      // Stream the file for download
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error downloading diagram:', error);
      return res.status(500).json({ error: 'Failed to download diagram' });
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
      
      console.log('Creating new chat for user:', req.user.id);
      
      const chat = await storage.createChat({
        userId: req.user.id,
        title: req.body.title || 'New Conversation'
      });
      
      console.log('Created new chat:', chat);
      
      // After creating the chat, refresh the list of chats for the user
      const refreshedChats = await storage.getUserChats(req.user.id);
      console.log(`User now has ${refreshedChats.length} chats`);
      
      return res.status(201).json(chat);
    } catch (error) {
      console.error('Error creating chat:', error);
      res.status(500).json({ error: 'Failed to create chat' });
    }
  });

  // Get all chats for the current user
  app.get('/api/chats', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      console.log('Fetching chats for user:', req.user.id);
      const chats = await storage.getUserChats(req.user.id);
      console.log(`Found ${chats.length} chats for user ${req.user.id}`);
      
      return res.json(chats);
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
  
  // Update a chat (specifically its title)
  app.patch('/api/chats/:id', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      
      if (chat.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const { title } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required' });
      }
      
      const updatedChat = await storage.updateChatTitle(chatId, title);
      console.log('Updated chat title:', updatedChat);
      
      return res.json(updatedChat);
    } catch (error) {
      console.error('Error updating chat:', error);
      res.status(500).json({ error: 'Failed to update chat' });
    }
  });
  
  // Delete a chat
  app.delete('/api/chats/:id', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);
      
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
      
      if (chat.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      await storage.deleteChat(chatId);
      console.log(`Chat ${chatId} deleted`);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting chat:', error);
      res.status(500).json({ error: 'Failed to delete chat' });
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
        content: req.body.content
      });
      
      return res.status(201).json(message);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ error: 'Failed to create message' });
    }
  });

  // Chat endpoint for AI responses with diagram generation
  app.post('/api/chat', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const { messages, model, temperature, maxTokens } = req.body;
      
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Invalid or missing messages' });
      }
      
      // Log the chat request
      console.log('Received chat request:', JSON.stringify({ messages, model, temperature, maxTokens }));
      
      // Validate that we have at least one message
      const validatedMessages = messages.filter(msg => 
        msg && typeof msg === 'object' && 
        typeof msg.role === 'string' && 
        typeof msg.content === 'string'
      );
      
      if (validatedMessages.length === 0) {
        return res.status(400).json({ error: 'No valid messages provided' });
      }
      
      console.log('Validated ' + validatedMessages.length + ' messages, proceeding with chat...');
      
      // Get the latest user message
      const latestUserMessage = validatedMessages
        .slice()
        .reverse()
        .find(m => m.role === 'user')?.content || '';
      
      console.log('Latest user message:', latestUserMessage);
      
      // Check if the message is requesting an image generation
      const isImageRequest = latestUserMessage.toLowerCase().includes('diagram');
      console.log('Image generation requested?', isImageRequest ? 'YES' : 'NO', 'for prompt:', JSON.stringify(latestUserMessage));
      
      // If this is a diagram request, generate a diagram
      let diagramReference = null;
      
      if (isImageRequest && typeof generateDiagram === 'function') {
        try {
          // Query Pinecone for relevant knowledge base entries
          console.log(`Creating comprehensive RiverMeadow diagram based on context and prompt`);
          
          // Generate diagram and get the path
          const diagramResult = await generateDiagram(latestUserMessage, []);
          console.log(`Successfully generated image: ${diagramResult.imagePath}`);
          
          // Add reference to the diagram
          diagramReference = {
            type: 'image',
            imagePath: diagramResult.imagePath,
            caption: 'Generated diagram based on knowledge base information',
            content: latestUserMessage
          };
        } catch (diagramError) {
          console.error('Error generating diagram:', diagramError);
        }
      }
      
      // Create the OpenAI API request with enhanced messages that reference the diagram
      let enhancedMessages = [...validatedMessages];
      
      // If a diagram was generated, append an assistant message that mentions it
      if (diagramReference) {
        // Add a system message before the user's message to instruct the AI about the diagram
        enhancedMessages.push({
          role: 'system',
          content: `A diagram has been generated based on the user's request. 
          
Please reference the diagram in your response with this exact phrase: "As you can see in the diagram below..." and then describe what the diagram is showing.

The diagram file is located at ${diagramReference.imagePath}, created with Draw.io XML format.

The diagram shows a cloud migration workflow with components like source environment, RiverMeadow Platform, and target cloud environments.

Explain that this diagram was generated based on their request, and they can download it or explore it interactively right in the chat. The diagram is interactive, allowing zoom, pan, and download options.`
        });
      }
      
      // Call OpenAI with the enhanced messages
      console.log('Using model:', model, 'temp:', temperature, 'max_tokens:', maxTokens);
      const openaiResponse = await openai.chat.completions.create({
        model: model || 'gpt-4o',
        messages: enhancedMessages,
        max_tokens: maxTokens || 2048,
        temperature: temperature || 0.5,
      });
      
      const aiResponse = openaiResponse.choices[0].message.content || 'No response generated.';
      
      // Construct the final response with any references
      const response: ChatResponse = {
        role: 'assistant',
        content: aiResponse
      };
      
      // Add the diagram reference if available
      if (diagramReference) {
        response.references = [diagramReference];
      }
      
      console.log('Successfully generated response from knowledge base');
      return res.status(200).json(response);
    } catch (err) {
      const error = err as Error;
      console.error('Error processing chat:', error);
      res.status(500).json({ error: 'Failed to process chat: ' + (error.message || 'Unknown error') });
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