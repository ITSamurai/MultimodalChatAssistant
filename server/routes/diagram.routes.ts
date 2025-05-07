/**
 * Diagram Routes
 * 
 * This file contains the API routes for diagram generation and retrieval.
 */
import { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { generateDiagram, isDiagramGenerationRequest } from '../services/diagram-generation.service';
import { generateCacheBustedFilename } from '../services/d2.service';
import { requireTokenAuth } from '../auth';

export function registerDiagramRoutes(app: Express) {
  /**
   * Generate a diagram from a prompt
   */
  app.post('/api/generate-diagram', requireTokenAuth, async (req: Request, res: Response) => {
    try {
      const { prompt, format = 'svg', reference_type = 'reference' } = req.body;
      
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
      }
      
      // Generate the diagram
      const diagramResult = await generateDiagram(prompt);
      
      // Determine which file to return based on requested format
      let filePath;
      let contentType;
      
      switch (format) {
        case 'xml':
          filePath = diagramResult.d2Path; // D2 script file
          contentType = 'text/plain';
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
        const cacheBustingName = generateCacheBustedFilename(path.basename(filePath, path.extname(filePath)), path.extname(filePath).substring(1));
        
        return res.json({
          success: true,
          title: diagramResult.diagramTitle,
          references: [
            {
              type: 'image',
              imagePath: `/${format === 'xml' ? 'diagram-xml' : format === 'png' ? 'diagram-png' : 'diagram-svg'}/${fileName}?v=${cacheBustingName}`,
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
   * Get a diagram D2 script file
   */
  app.get('/api/diagram-xml/:fileName', async (req: Request, res: Response) => {
    try {
      const filePath = path.join(process.cwd(), 'uploads', 'd2', req.params.fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'D2 diagram file not found' });
      }
      
      res.setHeader('Content-Type', 'text/plain');
      return res.sendFile(filePath);
    } catch (error) {
      console.error('Error retrieving D2 diagram script:', error);
      return res.status(500).json({ error: 'Failed to retrieve D2 diagram script' });
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
   * Download the full diagram (PNG format by default)
   */
  app.get('/api/download-full-diagram/:fileName', async (req: Request, res: Response) => {
    try {
      // Get the requested format (default to PNG)
      const format = (req.query.format as string) || 'png';
      const baseName = req.params.fileName.replace(/\.[^/.]+$/, ""); // remove extension if any
      
      // Determine the appropriate file path based on format
      let filePath = '';
      let contentType = 'application/octet-stream'; // Default content type
      
      if (format === 'png') {
        // Try to find PNG file
        filePath = path.join(process.cwd(), 'uploads', 'png', baseName + '.png');
        contentType = 'image/png';
      } else if (format === 'svg') {
        // Try to find SVG file
        filePath = path.join(process.cwd(), 'uploads', 'svg', baseName + '.svg');
        contentType = 'image/svg+xml';
      } else if (format === 'd2' || format === 'txt') {
        // Try to find D2 script file
        filePath = path.join(process.cwd(), 'uploads', 'd2', baseName + '.d2');
        contentType = 'text/plain';
      }
      
      // If file doesn't exist with exact name, try to find a file with similar name
      if (!fs.existsSync(filePath)) {
        const formatDir = format === 'png' ? 'png' : format === 'svg' ? 'svg' : 'd2';
        const targetDir = path.join(process.cwd(), 'uploads', formatDir);
        
        if (fs.existsSync(targetDir)) {
          const files = fs.readdirSync(targetDir);
          const matchingFile = files.find(file => file.includes(baseName));
          
          if (matchingFile) {
            filePath = path.join(targetDir, matchingFile);
          }
        }
      }
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Diagram file in ${format} format not found` });
      }
      
      // Set headers for download
      res.setHeader('Content-Type', contentType);
      // Set a more appropriate filename based on the format
      const fileExtension = format === 'd2' ? 'd2' : format === 'svg' ? 'svg' : 'png';
      const downloadFilename = `${baseName}.${fileExtension}`;
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      return res.sendFile(filePath);
    } catch (error) {
      console.error('Error downloading diagram:', error);
      return res.status(500).json({ error: 'Failed to download diagram' });
    }
  });
}