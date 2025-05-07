/**
 * Diagram Generation Service
 * 
 * This service handles the generation of diagrams using OpenAI's API
 * for intent understanding and D2 for diagram creation.
 */
import path from 'path';
import fs from 'fs';
import { OpenAI } from 'openai';
import { saveD2Script, d2ToSvg, d2ToPng } from './d2.service';

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DiagramGenerationResult {
  success: boolean;
  diagramTitle: string;
  d2Path: string;
  svgPath: string;
  pngPath: string;
}

/**
 * Determines if a user message is requesting a diagram generation
 */
export function isDiagramGenerationRequest(message: string): boolean {
  // Lowercase the message for case-insensitive matching
  const lowerMessage = message.toLowerCase();
  
  // Keywords that strongly indicate a diagram request
  const diagramKeywords = [
    'create a diagram',
    'generate a diagram', 
    'draw a diagram',
    'make a diagram',
    'diagram showing',
    'create diagram',
    'draw diagram',
    'diagram for',
    'flowchart',
    'architecture diagram',
    'visual representation',
    'D2 diagram',
    'network diagram',
    'system diagram',
    'process flow',
    'workflow diagram',
    'show me a diagram',
    'visualize',
    'create a visual',
    'migration diagram',
    'migration architecture',
    'cloud migration flow'
  ];
  
  // Check if the message contains any of the diagram keywords
  return diagramKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Generates a D2 diagram script based on a user prompt
 */
export async function generateD2Script(prompt: string): Promise<{
  script: string;
  title: string;
}> {
  try {
    console.log('Generating D2 script from prompt:', prompt);
    
    // Create a system prompt that instructs GPT to generate a D2 script
    const systemPrompt = "You are an expert at creating network diagrams using the D2 language. " +
    "The user will provide a description of a diagram they want to create for RiverMeadow's cloud migration platform. " +
    "Generate a complete, valid D2 diagram script based on the user's description.\n\n" +
    "Important rules:\n" +
    "1. Use D2 language syntax, not mermaid or any other format.\n" +
    "2. Always include 'direction: right' as the first line to set layout direction.\n" +
    "3. Keep node definitions simple with just the label.\n" +
    "4. DO NOT use complex style attributes as they may not be compatible with our D2 version.\n" +
    "5. Always create connections between components using the -> operator.\n" +
    "6. Do NOT include a title block as our D2 version doesn't support it.\n" +
    "7. Keep the diagram focused and not too complex (max 10-15 elements).\n\n" +
    "Example D2 diagram:\n" +
    "```\n" +
    "direction: right\n\n" +
    "source: \"Source Environment\"\n" +
    "target: \"Target Cloud\"\n" +
    "rivermeadow: \"RiverMeadow SaaS\"\n" +
    "discovery: \"Discovery\"\n" +
    "migration: \"Migration\"\n\n" +
    "source -> discovery -> rivermeadow -> migration -> target\n" +
    "```\n\n" +
    "Return only valid D2 code without any additional comments or explanations.";
    
    // Send the prompt to OpenAI to generate the D2 script
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Using GPT-4o for best results
      messages: [
        { 
          role: "system", 
          content: systemPrompt 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    // Extract the generated D2 script
    const rawResponse = completion.choices[0].message.content || '';
    
    // Extract the D2 script from the response (removing any markdown code blocks if present)
    let script = rawResponse.replace(/```d2\n|\```\n|```d2|```/g, '').trim();
    
    // Extract a title from the prompt or first line comments
    let title = "Generated Diagram";
    
    // Look for a comment that might contain a title
    const commentMatch = script.match(/^#\s*(.+)$/m);
    if (commentMatch && commentMatch[1]) {
      title = commentMatch[1].trim();
    } else {
      // Use part of the prompt as the title
      const promptWords = prompt.split(/\s+/).slice(0, 5).join(' ');
      title = `Diagram: ${promptWords}...`;
    }
    
    return { script, title };
  } catch (error) {
    console.error('Error generating D2 script:', error);
    throw new Error('Failed to generate diagram script');
  }
}

/**
 * Generates a diagram based on a user prompt
 */
export async function generateDiagram(prompt: string): Promise<DiagramGenerationResult> {
  try {
    // Generate the D2 script based on the prompt
    const { script, title } = await generateD2Script(prompt);
    
    // Save the script to a file
    const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const d2FilePath = saveD2Script(script, sanitizedTitle);
    
    // Generate SVG from the D2 script
    const svgContent = await d2ToSvg(d2FilePath);
    
    // Derive the SVG file path from the D2 file path
    const svgFileName = path.basename(d2FilePath, '.d2') + '.svg';
    const svgFilePath = path.join(process.cwd(), 'uploads', 'svg', svgFileName);
    
    // Derive the PNG file path
    const pngFileName = path.basename(d2FilePath, '.d2') + '.png';
    const pngFilePath = path.join(process.cwd(), 'uploads', 'png', pngFileName);
    
    // Save the SVG to file
    fs.writeFileSync(svgFilePath, svgContent);
    
    // Trigger PNG generation (this happens asynchronously)
    d2ToPng(d2FilePath).then(pngBuffer => {
      if (pngBuffer) {
        fs.writeFileSync(pngFilePath, pngBuffer);
        console.log(`PNG saved to ${pngFilePath}`);
      }
    }).catch(err => {
      console.error('Error saving PNG:', err);
    });
    
    return {
      success: true,
      diagramTitle: title,
      d2Path: d2FilePath,
      svgPath: svgFilePath,
      pngPath: pngFilePath
    };
  } catch (error) {
    console.error('Error generating diagram:', error);
    throw new Error('Failed to generate diagram');
  }
}