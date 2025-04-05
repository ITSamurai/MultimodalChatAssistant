import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as mammoth from 'mammoth';
import { parse } from 'node-html-parser';
import { storage } from '../storage';
import { InsertDocument, InsertDocumentImage } from '@shared/schema';

// Promisify fs functions
const mkdir = util.promisify(fs.mkdir);
const writeFile = util.promisify(fs.writeFile);

// Base directory for storing document images
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const IMAGES_DIR = path.join(UPLOADS_DIR, 'images');

// Ensure upload and images directories exist
const ensureDirectoriesExist = async () => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(IMAGES_DIR)) {
      await mkdir(IMAGES_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Error creating directories:', error);
    throw new Error('Failed to create upload directories');
  }
};

// Extract text from DOCX file
const extractTextFromDocument = async (docBuffer: Buffer): Promise<string> => {
  try {
    const result = await mammoth.extractRawText({ buffer: docBuffer });
    return result.value;
  } catch (error) {
    console.error('Error extracting text from document:', error);
    throw new Error('Failed to extract text from document');
  }
};

// Extract images from DOCX file
const extractImagesFromDocument = async (
  docBuffer: Buffer,
  documentId: number
): Promise<InsertDocumentImage[]> => {
  try {
    // Ensure directories exist
    await ensureDirectoriesExist();

    // Extract HTML content with images
    const result = await mammoth.convertToHtml({ buffer: docBuffer });
    const htmlContent = result.value;

    // Parse HTML to find images
    const root = parse(htmlContent);
    const imageElements = root.querySelectorAll('img');

    const images: InsertDocumentImage[] = [];
    
    // Process each image
    for (let i = 0; i < imageElements.length; i++) {
      const img = imageElements[i];
      const base64Data = img.getAttribute('src');
      
      if (base64Data && base64Data.startsWith('data:image')) {
        // Extract base64 content
        const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        
        if (matches && matches.length === 3) {
          const imageType = matches[1];
          const imageData = matches[2];
          const buffer = Buffer.from(imageData, 'base64');
          
          // Generate unique filename
          const timestamp = Date.now();
          const filename = `doc_${documentId}_img_${i + 1}_${timestamp}.${imageType}`;
          const imagePath = path.join(IMAGES_DIR, filename);
          
          // Save image to disk
          await writeFile(imagePath, buffer);
          
          // Create image entry
          const imageInfo: InsertDocumentImage = {
            documentId,
            imagePath: `/uploads/images/${filename}`,
            altText: img.getAttribute('alt') || `Image ${i + 1} from document`,
            caption: `Figure ${i + 1}`,
            pageNumber: null, // DOCX doesn't easily provide page numbers
          };
          
          images.push(imageInfo);
        }
      }
    }
    
    return images;
  } catch (error) {
    console.error('Error extracting images from document:', error);
    throw new Error('Failed to extract images from document');
  }
};

// Process document and store it
export const processDocument = async (
  file: Express.Multer.File
): Promise<{
  document: any;
  images: any[];
}> => {
  try {
    // Extract text
    const textContent = await extractTextFromDocument(file.buffer);
    
    // Create document in storage
    const documentData: InsertDocument = {
      name: file.originalname.substring(0, file.originalname.lastIndexOf('.')),
      originalName: file.originalname,
      contentText: textContent,
    };
    
    const document = await storage.createDocument(documentData);
    
    // Extract and save images
    const imageDataList = await extractImagesFromDocument(file.buffer, document.id);
    
    // Store images in database
    const savedImages = [];
    for (const imageData of imageDataList) {
      const savedImage = await storage.createDocumentImage(imageData);
      savedImages.push(savedImage);
    }
    
    return {
      document,
      images: savedImages,
    };
  } catch (error) {
    console.error('Error processing document:', error);
    throw new Error('Failed to process document');
  }
};

// Retrieve all data for a specific document
export const getDocumentData = async (documentId: number) => {
  const document = await storage.getDocument(documentId);
  
  if (!document) {
    throw new Error('Document not found');
  }
  
  const images = await storage.getDocumentImages(documentId);
  const messages = await storage.getMessages(documentId);
  
  return {
    document,
    images,
    messages,
  };
};
