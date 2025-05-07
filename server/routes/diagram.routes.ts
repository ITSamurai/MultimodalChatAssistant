/**
 * Diagram Routes
 * 
 * This file contains the API routes for diagram generation and retrieval.
 */

import { Express, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { z } from 'zod';
import { requireTokenAuth } from '../auth';
import { generateDiagram, isDiagramGenerationRequest } from '../services/diagram-generation.service';
import { ensureDirectoriesExist, generateCacheBustedFilename } from '../services/d2.service';

// Validate the generate diagram request body
const generateDiagramSchema = z.object({
  prompt: z.string().min(1, "Prompt must not be empty"),
  reference_type: z.enum(['direct', 'chat']).optional().default('direct'),
  format: z.enum(['xml', 'svg', 'png']).optional().default('svg'),
});

export function registerDiagramRoutes(app: Express) {
  // Ensure directories exist
  ensureDirectoriesExist();
  
  /**
   * Generate a diagram from a prompt
   */
  app.post('/api/generate-diagram', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      // Validate request body
      const result = generateDiagramSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid request', details: result.error.format() });
      }
      
      const { prompt, reference_type, format } = result.data;
      
      // Check if this is a diagram generation request
      if (!isDiagramGenerationRequest(prompt)) {
        return res.status(400).json({ error: 'Not a diagram generation request' });
      }
      
      console.log('Generating diagram for prompt:', prompt);
      
      // Generate the diagram
      const diagramResult = await generateDiagram(prompt);
      
      // Determine which file to return based on requested format
      let filePath;
      let contentType;
      
      switch (format) {
        case 'xml':
          filePath = diagramResult.xmlPath;
          contentType = 'application/xml';
          break;
        case 'png':
          filePath = diagramResult.pngPath;
          contentType = 'image/png';
          break;
        case 'svg':
        default:
          filePath = diagramResult.svgPath;
          contentType = 'image/svg+xml';
          break;
      }
      
      // Return the result based on reference_type
      if (reference_type === 'direct') {
        // Return the file directly
        res.setHeader('Content-Type', contentType);
        return res.sendFile(filePath);
      } else {
        // Return a reference to be used in the chat
        const fileName = path.basename(filePath);
        const cacheBustedName = generateCacheBustedFilename(path.basename(filePath, path.extname(filePath)), path.extname(filePath).substring(1));
        
        return res.json({
          success: true,
          title: diagramResult.diagramTitle,
          references: [
            {
              type: 'image',
              imagePath: `/${format === 'xml' ? 'diagram-xml' : format === 'png' ? 'diagram-png' : 'diagram-svg'}/${fileName}?v=${cacheBustedName}`,
              realPath: filePath,
              caption: diagramResult.diagramTitle,
              content: diagramResult.diagramTitle
            }
          ]
        });
      }
    } catch (error) {
      console.error('Error generating diagram:', error);
      return res.status(500).json({ error: 'Failed to generate diagram' });
    }
  });
  
  /**
   * Get a diagram XML file
   */
  app.get('/api/diagram-xml/:fileName', async (req: Request, res: Response) => {
    try {
      const filePath = path.join(process.cwd(), 'uploads', 'generated', req.params.fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Diagram file not found' });
      }
      
      res.setHeader('Content-Type', 'application/xml');
      return res.sendFile(filePath);
    } catch (error) {
      console.error('Error retrieving diagram XML:', error);
      return res.status(500).json({ error: 'Failed to retrieve diagram XML' });
    }
  });
  
  /**
   * Get a diagram SVG file
   */
  app.get('/api/diagram-svg/:fileName', async (req: Request, res: Response) => {
    try {
      const filePath = path.join(process.cwd(), 'uploads', 'svg', req.params.fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Diagram SVG not found' });
      }
      
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.sendFile(filePath);
    } catch (error) {
      console.error('Error retrieving diagram SVG:', error);
      return res.status(500).json({ error: 'Failed to retrieve diagram SVG' });
    }
  });
  
  /**
   * Get a diagram PNG file
   */
  app.get('/api/diagram-png/:fileName', async (req: Request, res: Response) => {
    try {
      const filePath = path.join(process.cwd(), 'uploads', 'png', req.params.fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Diagram PNG not found' });
      }
      
      res.setHeader('Content-Type', 'image/png');
      return res.sendFile(filePath);
    } catch (error) {
      console.error('Error retrieving diagram PNG:', error);
      return res.status(500).json({ error: 'Failed to retrieve diagram PNG' });
    }
  });
  
  /**
   * Download the full diagram (XML format)
   */
  app.get('/api/download-full-diagram/:fileName', async (req: Request, res: Response) => {
    try {
      const filePath = path.join(process.cwd(), 'uploads', 'generated', req.params.fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Diagram file not found' });
      }
      
      // Set headers for download
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.fileName}"`);
      return res.sendFile(filePath);
    } catch (error) {
      console.error('Error downloading diagram:', error);
      return res.status(500).json({ error: 'Failed to download diagram' });
    }
  });
}