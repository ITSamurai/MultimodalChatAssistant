import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as mammoth from 'mammoth';
// We'll dynamically import pdf-parse
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

// PDF processing functions

// Extract text from DOCX or PDF file based on file type
const extractTextFromDocument = async (docBuffer: Buffer, fileType: string): Promise<string> => {
  try {
    if (fileType.toLowerCase() === 'pdf') {
      // Process PDF document
      console.log("Processing PDF document...");
      
      try {
        // Import pdf-parse library dynamically for ESM compatibility
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = pdfParseModule.default;
        
        // Create custom options to prevent file system access
        const options = {
          // Prevent the library from accessing the file system
          // for its default test files
          disableFontFace: true,
          disableNativeArrayBuffer: true,
          verbosity: 0
        };
        
        // Process the PDF with the custom options
        const pdfData = await pdfParse(docBuffer, options);
        return pdfData.text;
      } catch (pdfError) {
        console.error('PDF processing error:', pdfError);
        // If parsing fails, return a basic message rather than failing completely
        return 'PDF text extraction failed. PDF content might not be fully accessible.';
      }
    } else {
      // Process DOCX document (default)
      console.log("Processing DOCX document...");
      const result = await mammoth.extractRawText({ buffer: docBuffer });
      return result.value;
    }
  } catch (error) {
    console.error('Error extracting text from document:', error);
    throw new Error('Failed to extract text from document');
  }
};

// Extract images from DOCX or PDF file
const extractImagesFromDocument = async (
  docBuffer: Buffer,
  documentId: number,
  fileType: string = 'docx' // Default to DOCX if not specified
): Promise<InsertDocumentImage[]> => {
  try {
    // Ensure directories exist
    await ensureDirectoriesExist();

    const images: InsertDocumentImage[] = [];
    
    if (fileType.toLowerCase() === 'pdf') {
      // PDF image extraction not yet implemented
      console.log("PDF image extraction is not yet supported. Will be added in a future update.");
      
      // Return empty image array for PDF files for now
      return images;
    } else {
      // Process DOCX document - use mammoth as before
      console.log("Extracting images from DOCX document...");
      
      // Extract HTML content with images
      const result = await mammoth.convertToHtml({ buffer: docBuffer });
      const htmlContent = result.value;
      
      // Log any warnings for debugging
      if (result.messages.length > 0) {
        console.log("Mammoth conversion messages:", result.messages);
      }
      
      // Log extracted HTML for debugging
      console.log("Extracted HTML length:", htmlContent.length);
      console.log("First 300 characters of HTML:", htmlContent.substring(0, 300));
  
      // Parse HTML to find images
      const root = parse(htmlContent);
      const imageElements = root.querySelectorAll('img');
      
      // Process each image
      for (let i = 0; i < imageElements.length; i++) {
        const img = imageElements[i];
        const base64Data = img.getAttribute('src');
      
        if (base64Data && base64Data.startsWith('data:image')) {
          // Extract base64 content
          const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
          
          if (matches && matches.length === 3) {
            const imageFormat = matches[1];
            const imageData = matches[2];
            const buffer = Buffer.from(imageData, 'base64');
            
            // Generate unique filename - we'll preserve format and optimize naming
            const timestamp = Date.now();
            const imgNum = i + 1;
            const filename = `doc_${documentId}_figure_${imgNum}_${timestamp}.${imageFormat}`;
            const imagePath = path.join(IMAGES_DIR, filename);
            
            // Log image extraction for debugging
            console.log(`Extracting image ${imgNum} from document ${documentId}: ${filename}`);
            
            // Save image to disk with high quality
            await writeFile(imagePath, buffer);
            
            // Analyze image for better classification
            const imageWidth = img.getAttribute('width') || 0;
            const imageHeight = img.getAttribute('height') || 0;
            const imgAlt = img.getAttribute('alt') || '';
            const imgTitle = img.getAttribute('title') || '';
            
            // Try to determine image classification based on attributes and surrounding context
            let imageClassification = 'unknown';
            let imageContext = '';
            
            // Look for parent elements that might provide context (like figure captions)
            let parentElement = img.parentNode;
            if (parentElement && parentElement.tagName && parentElement.tagName.toLowerCase() === 'figure') {
              const figCaption = parentElement.querySelector('figcaption');
              if (figCaption) {
                imageContext = figCaption.textContent || '';
              }
            }
            
            // Check for common diagram indicators in alt text or context
            const diagramKeywords = ['diagram', 'flow', 'chart', 'architecture', 'process', 'structure'];
            for (const keyword of diagramKeywords) {
              if ((imgAlt && imgAlt.toLowerCase().includes(keyword)) || 
                  (imgTitle && imgTitle.toLowerCase().includes(keyword)) ||
                  (imageContext && imageContext.toLowerCase().includes(keyword))) {
                imageClassification = 'diagram';
                break;
              }
            }
            
            // Create image entry with enhanced metadata
            const imageInfo: InsertDocumentImage = {
              documentId,
              imagePath: `/uploads/images/${filename}`,
              altText: imgAlt || imageContext || `Image ${imgNum} from document`,
              caption: imageContext || imgTitle || `Figure ${imgNum}`,
              pageNumber: null, // DOCX doesn't easily provide page numbers
            };
            
            images.push(imageInfo);
          }
        }
      }
    }
    
    return images;
  } catch (error) {
    console.error('Error extracting images from document:', error);
    throw new Error('Failed to extract images from document');
  }
};

// Process document and store it with enhanced text-image relationship mapping
export const processDocument = async (
  file: Express.Multer.File
): Promise<{
  document: any;
  images: any[];
}> => {
  try {
    // Determine file type from extension
    const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || '';
    const fileType = fileExtension === 'pdf' ? 'pdf' : 'docx';
    
    console.log(`Processing ${fileType.toUpperCase()} file: ${file.originalname}`);
    
    // Extract text
    let textContent = await extractTextFromDocument(file.buffer, fileType);
    
    // Enhanced document structure analysis
    console.log("Performing document structure analysis...");
    
    // Process and enhance the document structure
    const enhancedContent = analyzeAndEnhanceDocumentStructure(textContent);
    
    // Create document in storage
    const documentData: InsertDocument = {
      name: file.originalname.substring(0, file.originalname.lastIndexOf('.')),
      originalName: file.originalname,
      contentText: enhancedContent, // Store the enhanced and structured content
    };
    
    const document = await storage.createDocument(documentData);
    
    // Extract and save images with improved metadata
    const imageDataList = await extractImagesFromDocument(file.buffer, document.id, fileType);
    
    // Map images to their document context
    const imageToTextMapping = mapImagesToDocumentSections(enhancedContent, imageDataList);
    
    // Store images in database with enhanced context information
    const savedImages = [];
    for (let i = 0; i < imageDataList.length; i++) {
      const imageData = imageDataList[i];
      
      // Enhance image metadata with document context
      if (imageToTextMapping[i]) {
        // Add surrounding text context to the caption if found
        const contextInfo = imageToTextMapping[i];
        if (contextInfo.surroundingText) {
          // Safely handle potentially undefined caption
          const currentCaption = imageData.caption || `Image ${i+1}`;
          if (!currentCaption.includes(contextInfo.surroundingText)) {
            imageData.caption = `${currentCaption} - ${contextInfo.surroundingText}`;
          }
        }
        
        // Add section information if available
        if (contextInfo.section) {
          imageData.altText = `${imageData.altText || ''} (Section: ${contextInfo.section})`;
        }
        
        // Add figure number if detected
        if (contextInfo.figureNumber) {
          // Safely handle potentially undefined caption
          const currentCaption = imageData.caption || `Image ${i+1}`;
          if (!currentCaption.includes(`Figure ${contextInfo.figureNumber}`)) {
            imageData.caption = `Figure ${contextInfo.figureNumber}: ${currentCaption}`;
          }
        }
      }
      
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

// Analyze and enhance document structure for better organization and context
function analyzeAndEnhanceDocumentStructure(content: string): string {
  // Split by lines for analysis
  const lines = content.split("\n");
  const enhancedLines = [];
  
  // Track document structure
  let currentSection = "";
  let currentSubsection = "";
  let inList = false;
  let listType = ""; // "numbered" or "bullet"
  
  // Patterns for structure detection
  const sectionPattern = /^[A-Z][A-Z\s]+$|^[0-9]+\.\s+[A-Z]/;
  const subsectionPattern = /^[0-9]+\.[0-9]+\s+|^[A-Za-z]+\s+[0-9]+\./;
  const numberedListPattern = /^[0-9]+\.\s+/;
  const bulletListPattern = /^[•\-\*]\s+/;
  const figureReferencePattern = /Figure\s+([0-9]+)/i;
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Empty lines - maintain them
    if (line === "") {
      enhancedLines.push("");
      continue;
    }
    
    // Detect sections (headings)
    if (line.match(sectionPattern)) {
      currentSection = line;
      // Add section markers for better parsing
      enhancedLines.push(`\n## SECTION_START: ${line} ##`);
      enhancedLines.push(line);
      continue;
    }
    
    // Detect subsections
    if (line.match(subsectionPattern)) {
      currentSubsection = line;
      // Add subsection markers
      enhancedLines.push(`\n### SUBSECTION_START: ${line} ###`);
      enhancedLines.push(line);
      continue;
    }
    
    // Detect numbered lists
    if (line.match(numberedListPattern)) {
      if (!inList || listType !== "numbered") {
        inList = true;
        listType = "numbered";
        enhancedLines.push("\n#### NUMBERED_LIST_START ####");
      }
      enhancedLines.push(line);
      continue;
    }
    
    // Detect bullet lists
    if (line.match(bulletListPattern)) {
      if (!inList || listType !== "bullet") {
        inList = true;
        listType = "bullet";
        enhancedLines.push("\n#### BULLET_LIST_START ####");
      }
      enhancedLines.push(line);
      continue;
    }
    
    // End list if no longer in a list item
    if (inList && !line.match(numberedListPattern) && !line.match(bulletListPattern)) {
      inList = false;
      listType = "";
      enhancedLines.push("#### LIST_END ####\n");
    }
    
    // Detect figure references and mark them
    const figureMatch = line.match(figureReferencePattern);
    if (figureMatch) {
      const figureNumber = figureMatch[1];
      // Tag the line with a marker for easier detection
      enhancedLines.push(`FIGURE_REFERENCE(${figureNumber}): ${line}`);
      continue;
    }
    
    // Regular content - add with context info if in a section
    if (currentSection) {
      enhancedLines.push(`${line}`);
    } else {
      enhancedLines.push(line);
    }
  }
  
  return enhancedLines.join("\n");
}

// Map images to relevant document sections to create text-image relationships
function mapImagesToDocumentSections(
  structuredContent: string, 
  images: InsertDocumentImage[]
): { 
  [imageIndex: number]: { 
    section?: string, 
    figureNumber?: number, 
    surroundingText?: string 
  } 
} {
  // Map to store image context information
  const imageContextMap: { [imageIndex: number]: any } = {};
  
  // Find potential figure numbers from captions
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    
    // Extract potential figure numbers from captions or alt text
    const caption = image.caption || '';
    const figureMatch = caption.match(/figure\s+([0-9]+)/i);
    
    if (figureMatch) {
      const figureNumber = parseInt(figureMatch[1]);
      imageContextMap[i] = {
        figureNumber,
        section: "",
        surroundingText: ""
      };
    } else {
      imageContextMap[i] = {
        section: "",
        surroundingText: ""
      };
    }
  }
  
  // Process the structured content to find image references
  const contentLines = structuredContent.split('\n');
  let currentSection = "";
  
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];
    
    // Track sections
    if (line.startsWith('## SECTION_START:')) {
      currentSection = line.replace('## SECTION_START:', '').replace('##', '').trim();
      continue;
    }
    
    // Look for figure references
    const figureMatch = line.match(/FIGURE_REFERENCE\(([0-9]+)\):/);
    if (figureMatch) {
      const figureNumber = parseInt(figureMatch[1]);
      
      // Find the corresponding image
      for (let imgIndex = 0; imgIndex < images.length; imgIndex++) {
        if (imageContextMap[imgIndex] && imageContextMap[imgIndex].figureNumber === figureNumber) {
          // Found a matching image - get surrounding text
          const surroundingTextStart = Math.max(0, i - 3);
          const surroundingTextEnd = Math.min(contentLines.length - 1, i + 3);
          const surroundingText = contentLines
            .slice(surroundingTextStart, surroundingTextEnd)
            .filter(l => !l.startsWith('##') && !l.startsWith('####') && l.trim() !== '')
            .join(' ')
            .substring(0, 200) + "..."; // Limit length
          
          // Update the image context
          imageContextMap[imgIndex].section = currentSection;
          imageContextMap[imgIndex].surroundingText = surroundingText;
        }
      }
    }
  }
  
  // For images without explicit figure numbers, try to find relevance through caption/section matching
  for (let i = 0; i < images.length; i++) {
    if (!imageContextMap[i] || !imageContextMap[i].figureNumber) {
      const image = images[i];
      const caption = (image.caption || '').toLowerCase();
      const altText = (image.altText || '').toLowerCase();
      
      // Find sections that might match the image content
      let bestMatchScore = 0;
      let bestMatchSection = "";
      let bestMatchSurroundingText = "";
      
      let currentScore = 0;
      contentLines.forEach((line, lineIndex) => {
        if (line.startsWith('## SECTION_START:')) {
          const sectionText = line.replace('## SECTION_START:', '').replace('##', '').trim().toLowerCase();
          currentScore = 0;
          
          // Simple relevance matching - count common words
          const sectionWords = sectionText.split(/\s+/);
          const captionWords = caption.split(/\s+/);
          
          sectionWords.forEach(word => {
            if (word.length > 3 && caption.includes(word)) currentScore += 3;
            if (word.length > 3 && altText.includes(word)) currentScore += 2;
          });
          
          if (currentScore > bestMatchScore) {
            bestMatchScore = currentScore;
            bestMatchSection = line.replace('## SECTION_START:', '').replace('##', '').trim();
            
            // Get some surrounding context
            const surroundingTextStart = Math.max(0, lineIndex - 2);
            const surroundingTextEnd = Math.min(contentLines.length - 1, lineIndex + 5);
            bestMatchSurroundingText = contentLines
              .slice(surroundingTextStart, surroundingTextEnd)
              .filter(l => !l.startsWith('##') && !l.startsWith('####') && l.trim() !== '')
              .join(' ')
              .substring(0, 200) + "..."; // Limit length
          }
        }
      });
      
      // Only use match if it's reasonably strong
      if (bestMatchScore > 3) {
        imageContextMap[i] = {
          ...imageContextMap[i],
          section: bestMatchSection,
          surroundingText: bestMatchSurroundingText
        };
      }
    }
  }
  
  return imageContextMap;
}

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
