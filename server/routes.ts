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
import { 
  ensureDirectoriesExist, 
  drawioToSvg, 
  drawioToPng
} from './services/drawio.service.simple';
import { generateDiagram, isDiagramGenerationRequest } from './services/diagram-generation.service';
import { registerDiagramRoutes } from './routes/diagram.routes';

// Define custom types
interface ChatResponse {
  role: string;
  content: string;
  references?: Array<{
    type: string;
    imagePath: string;  // Now includes cache-busting parameters
    realPath?: string;  // The original path without cache-busting
    caption: string;
    content: string;
    timestamp?: string; // When the reference was generated
  }>;
}

// Initialize Pinecone for vector search
let pineconeIndex: any = null;

// Initialize OpenAI for text completions
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Ensure all necessary directories exist at startup
try {
  ensureDirectoriesExist();
  console.log('Created necessary directories for uploads and diagrams');
} catch (err) {
  console.error('Error creating upload directories:', err);
}

// Utility function to get embeddings from OpenAI
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 1536 // Match Pinecone index dimensions
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

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
  // Set up authentication routes - must be awaited since it's now async
  await setupAuth(app);
  
  // Register diagram-related routes
  registerDiagramRoutes(app);
  
  // API endpoint to serve Draw.IO XML directly - no authentication required
  app.get('/api/diagram-xml/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      const filePath = path.join(process.cwd(), 'uploads', 'generated', fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Diagram not found' });
      }
      
      // Read file contents properly without trying to add query params to the fs call
      // Use same technique as in diagram-svg route to bypass filesystem cache
      const fileDescriptor = fs.openSync(filePath, 'r');
      const fileStats = fs.fstatSync(fileDescriptor);
      const fileSize = fileStats.size;
      const buffer = Buffer.alloc(fileSize);
      fs.readSync(fileDescriptor, buffer, 0, fileSize, 0);
      fs.closeSync(fileDescriptor);
      
      const fileContent = buffer.toString('utf8');
      
      // Set aggressive no-cache headers
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
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
      // Extract the filename and remove any query parameters
      const fileName = req.params.fileName.split('?')[0];
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
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.status(200).send(placeholderSvg);
      }
      
      try {
        // Generate SVG from diagram file
        const svgContent = await drawioToSvg(filePath);
        console.log('Successfully generated SVG from diagram file');
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        return res.status(200).send(svgContent);
      } catch (svgError) {
        console.error('Error generating SVG:', svgError);
        
        // Create a simple error SVG
        const errorSvg = `
          <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#fff0f0" />
            <text x="50%" y="40%" font-family="Arial" font-size="24" text-anchor="middle" fill="#cc0000">
              SVG Generation Error
            </text>
            <text x="50%" y="50%" font-family="Arial" font-size="16" text-anchor="middle" fill="#333">
              An error occurred while generating the SVG
            </text>
            <text x="50%" y="60%" font-family="Arial" font-size="14" text-anchor="middle" fill="#666">
              File: ${path.basename(filePath)}
            </text>
          </svg>
        `;
        
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(200).send(errorSvg);
      }
    } catch (error) {
      console.error('Error in SVG endpoint:', error);
      return res.status(500).json({ error: 'Failed to generate SVG' });
    }
  });

  // API endpoint to render Draw.IO diagram as PNG - no authentication required
  app.get('/api/diagram-png/:fileName', async (req: Request, res: Response) => {
    try {
      const fileName = req.params.fileName;
      let filePath = path.join(process.cwd(), 'uploads', 'generated', fileName);
      
      // Check for alternate paths if the exact one isn't found
      if (!fs.existsSync(filePath)) {
        // Try with different extensions
        const baseFileName = fileName.replace(/\.(xml|drawio|html|png)$/, '');
        const possiblePaths = [
          path.join(process.cwd(), 'uploads', 'generated', baseFileName + '.drawio'),
          path.join(process.cwd(), 'uploads', 'generated', baseFileName + '.xml'),
          path.join(process.cwd(), 'uploads', 'generated', baseFileName),
          path.join(process.cwd(), 'attached_assets', 'rivermeadow_diagram_1746107014375.png')
        ];
        
        for (const testPath of possiblePaths) {
          if (fs.existsSync(testPath)) {
            console.log(`Found file at alternate path: ${testPath}`);
            filePath = testPath;
            break;
          }
        }
      }
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Diagram not found' });
      }
      
      // Try to directly convert to PNG (future implementation)
      const pngBuffer = await drawioToPng(filePath);
      
      // If we have a PNG buffer, return it
      if (pngBuffer) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.status(200).send(pngBuffer);
      }
      
      // If direct PNG conversion failed, try to generate an SVG as fallback
      try {
        // Generate SVG from the diagram file
        const svgContent = await drawioToSvg(filePath);
        
        // If successful, return with appropriate headers
        if (svgContent) {
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          // Note to client that this is an SVG fallback
          res.setHeader('X-PNG-Fallback', 'Using SVG as PNG generation is not yet implemented');
          return res.status(200).send(svgContent);
        }
      } catch (svgError) {
        console.error('Error generating SVG fallback for PNG:', svgError);
      }
      
      // If SVG generation failed and this is a PNG already, serve it directly
      if (filePath.toLowerCase().endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        // Read the file and return it
        const fileContent = fs.readFileSync(filePath);
        return res.status(200).send(fileContent);
      }
      
      // If all else fails, return a not implemented response
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('Content-Type', 'text/plain');
      
      return res.status(501).send('Direct PNG conversion is not implemented yet. Please use the SVG endpoint instead.');
    } catch (error) {
      console.error('Error generating PNG:', error);
      return res.status(500).json({ error: 'Failed to generate PNG' });
    }
  });
  
  // API endpoint to download a diagram as PNG (full version) - no authentication required
  // API endpoint to download the full diagram file
  app.get('/api/download-full-diagram/:fileName', async (req: Request, res: Response) => {
    try {
      // Remove any query parameters from the filename
      const fileName = req.params.fileName.split('?')[0];
      
      // Try multiple possible file extensions and paths
      const possiblePaths = [
        path.join(process.cwd(), 'uploads', 'generated', `${fileName}.drawio`),
        path.join(process.cwd(), 'uploads', 'generated', `${fileName}.xml`),
        path.join(process.cwd(), 'uploads', 'generated', fileName),
        // Also try with the attachment
        path.join(process.cwd(), 'attached_assets', 'rivermeadow_diagram_1746107014375.png')
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
      
      // Determine content type and filename based on extension
      const extension = path.extname(filePath).toLowerCase();
      const contentType = 
        extension === '.png' ? 'image/png' :
        extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' :
        extension === '.svg' ? 'image/svg+xml' :
        'application/octet-stream';
      
      // File extension for download
      const downloadExtension = 
        extension === '.png' ? 'png' :
        extension === '.jpg' || extension === '.jpeg' ? 'jpg' :
        extension === '.svg' ? 'svg' :
        'drawio';
        
      // Set proper headers for download with strong cache control
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="rivermeadow_diagram_${Date.now()}.${downloadExtension}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // Use the same non-caching file read method for consistency
      const fileDescriptor = fs.openSync(filePath, 'r');
      const fileStats = fs.fstatSync(fileDescriptor);
      const fileSize = fileStats.size;
      
      // Stream the file for download using a buffer to ensure fresh content
      const buffer = Buffer.alloc(fileSize);
      fs.readSync(fileDescriptor, buffer, 0, fileSize, 0);
      fs.closeSync(fileDescriptor);
      
      res.end(buffer);
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
      
      // Check if the message is requesting a diagram generation
      const isDiagramRequest = isDiagramGenerationRequest(latestUserMessage);
      console.log('Diagram generation requested?', isDiagramRequest ? 'YES' : 'NO', 'for prompt:', JSON.stringify(latestUserMessage));
      
      // If this is a diagram request, generate a diagram
      let diagramReference = null;
      
      if (isDiagramRequest) {
        try {
          // Query Pinecone for relevant knowledge base entries
          console.log(`Creating comprehensive RiverMeadow diagram based on prompt`);
          
          // Generate diagram and get the path
          const diagramResult = await generateDiagram(latestUserMessage);
          
          // Add a timestamp-based query parameter to the image path to prevent caching
          // This will force the frontend to always load the latest version of the diagram
          const uniqueTimestamp = Date.now();
          const randomId = Math.random().toString(36).substring(2, 10);
          const cacheBustingPath = `${diagramResult.svgPath}?ver=${uniqueTimestamp}-${randomId}`;
          
          console.log(`Successfully generated diagram: ${path.basename(diagramResult.svgPath)}`);
          console.log(`Cache-busting path for frontend: ${cacheBustingPath}`);
          
          // Add reference to the diagram with both the actual path and a cache-busting path
          diagramReference = {
            type: 'image',
            imagePath: diagramResult.svgPath + '?t=' + Date.now(), // Use the version with cache-busting
            realPath: diagramResult.svgPath, // Store the real path too
            caption: `RiverMeadow ${diagramResult.diagramTitle || 'Generated'} Diagram`,
            content: latestUserMessage,
            timestamp: Date.now().toString()
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
      // Use a higher temperature (default 1.0) for more creative and varied responses
      console.log('Using model:', model, 'temp:', temperature, 'max_tokens:', maxTokens);
      const openaiResponse = await openai.chat.completions.create({
        model: model || 'gpt-4o',
        messages: enhancedMessages,
        max_tokens: maxTokens || 2048,
        temperature: temperature || 1.0, // Default to 1.0 for more variation
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
      const { prompt } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }
      
      // Generate diagram using the imported function
      const result = await generateDiagram(prompt);
      
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