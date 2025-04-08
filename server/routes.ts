import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { processDocument, getDocumentData } from "./services/document.service";
import { processMessage } from "./services/openai.service";
import { chatMessageSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure multer for in-memory storage
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit (increased from 10MB)
  });

  // Serve static files from uploads directory
  app.use('/uploads', express.static('uploads'));

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

  const httpServer = createServer(app);

  return httpServer;
}
