import { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import * as fs from 'fs';
import multer from 'multer';
import { createServer, Server } from 'http';
import { setupAuth, requireTokenAuth, hashPassword, verifyAuthToken } from './auth';
import { storage } from './storage';
import { User } from '@shared/schema';
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
  
  // Admin routes for user management
  // Get all users (admin/superadmin only)
  app.get('/api/admin/users', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      
      const users = await storage.getAllUsers();
      return res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });
  
  // Create a new user (admin/superadmin only)
  app.post('/api/admin/users', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      
      const { username, password, name, role } = req.body;
      
      // Basic validation
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      
      // Only superadmins can create other superadmins
      if (role === 'superadmin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only superadmins can create other superadmins' });
      }
      
      // Hash the password
      const hashedPassword = await hashPassword(password);
      
      // Create the user
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name: name || username,
        role: role || 'user',
        email: `${username}@example.com` // Default email pattern
      });
      
      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      
      return res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });
  
  // Update a user (admin/superadmin only)
  app.patch('/api/admin/users/:id', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      
      const userId = parseInt(req.params.id);
      
      // Get the user to update
      const userToUpdate = await storage.getUser(userId);
      if (!userToUpdate) {
        return res.status(404).json({ error: 'User not found.' });
      }
      
      // Role-based restrictions
      // Only superadmins can modify other superadmins
      if (userToUpdate.role === 'superadmin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'You do not have permission to modify a superadmin.' });
      }
      
      // Only superadmins can promote users to superadmin
      if (req.body.role === 'superadmin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only superadmins can promote users to superadmin.' });
      }
      
      // Prepare update data
      const updateData: Partial<User> = {};
      
      if (req.body.username && req.body.username !== userToUpdate.username) {
        // Check if new username already exists (if changing username)
        const existingUser = await storage.getUserByUsername(req.body.username);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ error: 'Username already exists.' });
        }
        updateData.username = req.body.username;
      }
      
      if (req.body.password) {
        // Update password if provided
        updateData.password = await hashPassword(req.body.password);
      }
      
      if (req.body.role) {
        updateData.role = req.body.role;
      }
      
      // Update the user
      const updatedUser = await storage.updateUser(userId, updateData);
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found.' });
      }
      
      // Return the user without password
      const { password, ...userWithoutPassword } = updatedUser;
      res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: 'An error occurred while updating the user.' });
    }
  });
  
  // Delete a user (admin/superadmin only)
  app.delete('/api/admin/users/:id', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      
      const userId = parseInt(req.params.id);
      
      // Prevent deleting yourself
      if (userId === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }
      
      // Get the user to check their role
      const userToDelete = await storage.getUser(userId);
      if (!userToDelete) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Prevent deletion of any superadmin user
      if (userToDelete.role === 'superadmin') {
        return res.status(403).json({ error: 'Superadmin accounts cannot be deleted through the API' });
      }
      
      // Only superadmins can delete admin accounts
      if (userToDelete.role === 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only superadmins can delete admin accounts' });
      }
      
      await storage.deleteUser(userId);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
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
      const { messages, model, temperature, maxTokens, chatId } = req.body;
      
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Invalid or missing messages' });
      }

      // Ensure we have a valid chatId
      if (!chatId || typeof chatId !== 'number') {
        return res.status(400).json({ error: 'Valid chatId is required' });
      }
      
      // Log the chat request
      console.log('Received chat request:', JSON.stringify({ chatId, messages, model, temperature, maxTokens }));
      
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
      
      // Get the latest user message (it should be the last one in the array)
      const latestUserMessage = validatedMessages
        .slice()
        .reverse()
        .find(m => m.role === 'user')?.content || '';
      
      // Get the latest message object (for storing in DB)
      const latestMessage = validatedMessages[validatedMessages.length - 1];
      
      // Store the latest user message in the database for this chat
      if (latestMessage.role === 'user') {
        await storage.createChatMessage({
          chatId,
          content: latestMessage.content,
          role: latestMessage.role,
          references: null
        });
      }
      
      console.log('Latest user message:', latestUserMessage);
      
      // Force diagram generation for specific types of requests related to RiverMeadow structure
      const forceDiagram = 
        latestUserMessage.toLowerCase().includes('rivermeadow') && 
        (latestUserMessage.toLowerCase().includes('components') ||
         latestUserMessage.toLowerCase().includes('application') ||
         latestUserMessage.toLowerCase().includes('structure') ||
         latestUserMessage.toLowerCase().includes('architecture') ||
         latestUserMessage.toLowerCase().includes('create diagram') ||
         latestUserMessage.toLowerCase().includes('generate diagram') ||
         latestUserMessage.toLowerCase().includes('show') &&
           latestUserMessage.toLowerCase().includes('visual'));
      
      // Additional check for combined OS and VM based migration diagrams
      const isCombinedMigrationRequest = 
        latestUserMessage.toLowerCase().includes('combine') && 
        latestUserMessage.toLowerCase().includes('os') && 
        latestUserMessage.toLowerCase().includes('vm') ||
        (latestUserMessage.toLowerCase().includes('combine') && 
         latestUserMessage.toLowerCase().includes('both')) ||
        (latestUserMessage.toLowerCase().includes('both') && 
         latestUserMessage.toLowerCase().includes('in one')) ||
        (latestUserMessage.toLowerCase().includes('create') && 
         latestUserMessage.toLowerCase().includes('diagram') && 
         latestUserMessage.toLowerCase().includes('both')) || 
        (latestUserMessage.toLowerCase().includes('migration') && 
         latestUserMessage.toLowerCase().includes('both') && 
         latestUserMessage.toLowerCase().includes('one'));
      
      // Check if the message is requesting a diagram generation
      const isDiagramRequest = forceDiagram || isDiagramGenerationRequest(latestUserMessage) || isCombinedMigrationRequest;
      
      if (forceDiagram) {
        console.log('Forcing diagram generation for RiverMeadow structure request');
      }
      
      if (isCombinedMigrationRequest) {
        console.log('Detected combined OS and VM migration diagram request');
      }
      
      console.log('Diagram generation requested?', isDiagramRequest ? (forceDiagram ? 'FORCED YES' : 'YES') : 'NO', 'for prompt:', JSON.stringify(latestUserMessage));
      
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
          // Convert the full path to a relative API path that the front end can use
          const svgFileName = path.basename(diagramResult.svgPath);
          
          diagramReference = {
            type: 'image',
            imagePath: `/api/diagram-svg/${svgFileName}?t=${Date.now()}`, // Use API endpoint with cache-busting
            realPath: diagramResult.svgPath, // Store the real path too
            caption: `RiverMeadow ${diagramResult.diagramTitle || 'Generated'} Diagram`,
            content: latestUserMessage,
            timestamp: Date.now().toString()
          };
        } catch (diagramError) {
          console.error('Error generating diagram:', diagramError);
        }
      }
      
      // Retrieve the chat history from the database
      const chatHistory = await storage.getChatMessages(chatId);
      console.log(`Retrieved ${chatHistory.length} messages from chat history`);
      
      // Convert the database chat messages to the format expected by OpenAI
      const historyMessages = chatHistory.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }));
      
      // Create the OpenAI API request with chat history and the latest message
      // Note: We use the history from the database instead of the passed messages
      // to ensure we have the complete conversation context
      let enhancedMessages = [...historyMessages];
      
      // If a diagram was generated, append a system message that mentions it
      if (diagramReference) {
        // Add a system message before the user's message to instruct the AI about the diagram
        enhancedMessages.push({
          role: 'system',
          content: `A diagram has been generated based on the user's request. 
          
Please reference the diagram in your response with this exact phrase: "As you can see in the diagram below..." and then describe what the diagram is showing.

The diagram file is served through the API and displayed below. It was created with D2, a modern diagram scripting language.

The diagram shows a RiverMeadow cloud migration workflow with components as requested by the user.

Explain that this diagram was generated based on their request, and they can download it as a PNG file or explore it interactively right in the chat. Tell them to click the "Download PNG" button in the diagram viewer to save a high-quality PNG version of the diagram. The diagram viewer is also interactive, allowing zoom and pan functionality.`
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
      
      // Store the AI response in the database
      await storage.createChatMessage({
        chatId,
        content: aiResponse,
        role: 'assistant',
        references: diagramReference ? [diagramReference] : null
      });
      
      console.log('Successfully generated and stored response from knowledge base');
      return res.status(200).json(response);
    } catch (err) {
      const error = err as Error;
      console.error('Error processing chat:', error);
      res.status(500).json({ error: 'Failed to process chat: ' + (error.message || 'Unknown error') });
    }
  });
  
  // Debug endpoint for token information (temporary, for debugging)
  app.get('/api/debug/token-info', async (req: Request, res: Response) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(400).json({ error: 'No token provided in Authorization header' });
      }
      
      const token = authHeader.split(' ')[1];
      
      // Get user from token
      const user = await verifyAuthToken(token, req);
      
      if (!user) {
        return res.json({ 
          valid: false, 
          message: 'Token is invalid or expired',
          token_prefix: token.substring(0, 10) + '...'
        });
      }
      
      return res.json({
        valid: true, 
        user_id: user.id,
        username: user.username,
        role: user.role,
        token_prefix: token.substring(0, 10) + '...'
      });
    } catch (error) {
      console.error('Error in token debug endpoint:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Error checking token', message: errorMessage });
    }
  });
  
  // Register diagram routes
  registerDiagramRoutes(app);
  
  // Create the HTTP server
  const httpServer = createServer(app);
  
  return httpServer;
}