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
  d2ToSvg, 
  d2ToPng
} from './services/d2.service';
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
  
  // All diagram routes are now handled by diagram.routes.ts
  // Keeping this comment as a reference of where the routes used to be
  
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
  
  // This diagram generation endpoint has been moved to diagram.routes.ts
  
  // Create the HTTP server
  const httpServer = createServer(app);
  
  return httpServer;
}