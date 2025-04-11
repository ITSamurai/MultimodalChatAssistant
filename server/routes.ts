import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { processDocument, getDocumentData } from "./services/document.service";
import { processMessage } from "./services/openai.service";
import { chatMessageSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";
import { 
  initializePineconeIndex, 
  indexDocumentInPinecone,
  addKnowledgeToPinecone,
  createChatWithKnowledgeBase
} from './services/pinecone.service';
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

  const httpServer = createServer(app);

  return httpServer;
}
