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
  const lowerMessage = message.toLowerCase().trim();
  
  // Strong keywords that directly indicate diagram generation
  const strongKeywords = [
    'generate diagram',
    'create diagram',
    'draw diagram',
    'make diagram',
    'build diagram',
    'produce diagram',
    'design diagram',
    'provide diagram',
    'diagram of',
    'diagram for',
    'diagram about'
  ];
  
  // General diagram type keywords 
  const diagramTypeKeywords = [
    'flowchart',
    'architecture diagram',
    'visual representation',
    'network diagram',
    'system diagram',
    'structure diagram',
    'organization diagram',
    'process flow',
    'workflow diagram',
    'organizational chart',
    'component diagram',
    'deployment diagram',
    'entity relationship',
    'data flow',
    'sequence diagram',
    'class diagram',
    'uml diagram',
    'migration diagram',
    'migration architecture',
    'cloud migration flow'
  ];
  
  // Visual action keywords
  const visualActionKeywords = [
    'visualize',
    'create a visual',
    'show me a diagram',
    'display diagram',
    'diagram showing'
  ];
  
  // Combine all keywords
  const allKeywords = [...strongKeywords, ...diagramTypeKeywords, ...visualActionKeywords];
  
  // Check for strong indicator keywords directly
  for (const keyword of strongKeywords) {
    if (lowerMessage.includes(keyword)) {
      console.log(`Detected diagram request with strong keyword: "${keyword}"`);
      return true;
    }
  }
  
  // For other keywords, look for diagram-related words
  const hasDiagramWord = lowerMessage.includes('diagram') || 
                         lowerMessage.includes('chart') || 
                         lowerMessage.includes('flowchart') || 
                         lowerMessage.includes('visual');
                          
  // If the word "diagram" or related terms are present, check if any other keywords match
  if (hasDiagramWord) {
    for (const keyword of allKeywords) {
      if (lowerMessage.includes(keyword)) {
        console.log(`Detected diagram request with keyword: "${keyword}"`);
        return true;
      }
    }
  }
  
  // Special case for messages that start with "generate" and contain structure/organization related terms
  if (lowerMessage.startsWith('generate') || lowerMessage.startsWith('create')) {
    const structureTerms = ['structure', 'organization', 'hierarchy', 'layout', 'architecture'];
    for (const term of structureTerms) {
      if (lowerMessage.includes(term)) {
        console.log(`Detected potential diagram request with structure term: "${term}"`);
        return true;
      }
    }
  }
  
  return false;
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
    // Determine if this is an organization structure diagram or a technical diagram
    const isOrganizationDiagram = prompt.toLowerCase().includes('structure') || 
                                  prompt.toLowerCase().includes('organization') || 
                                  prompt.toLowerCase().includes('hierarchy') || 
                                  prompt.toLowerCase().includes('company');
    
    let systemPrompt;
    
    if (isOrganizationDiagram) {
      // System prompt for organizational/structure diagrams
      systemPrompt = "You are an expert at creating organizational and structural diagrams using the D2 language. " +
      "The user is requesting a diagram related to RiverMeadow's organization, structure or hierarchy. " +
      "Generate a complete, valid D2 diagram script that represents an organizational structure.\n\n" +
      "Important rules:\n" +
      "1. Use D2 language syntax, not mermaid or any other format.\n" +
      "2. For organizational diagrams, use 'direction: down' as the first line to represent hierarchy.\n" +
      "3. Keep node definitions simple with just the label.\n" +
      "4. DO NOT use complex style attributes as they may not be compatible with our D2 version.\n" +
      "5. Use -> for connections between components to show reporting lines or relationships.\n" +
      "6. DO NOT include a title block as our D2 version doesn't support it.\n" +
      "7. Include key organizational elements like leadership, departments, and teams.\n\n" +
      "Example D2 organizational diagram:\n" +
      "```\n" +
      "direction: down\n\n" +
      "ceo: \"CEO\"\n" +
      "cto: \"CTO\"\n" +
      "cfo: \"CFO\"\n" +
      "vp_sales: \"VP Sales\"\n" +
      "engineering: \"Engineering\"\n" +
      "product: \"Product\"\n" +
      "finance: \"Finance\"\n" +
      "sales: \"Sales\"\n\n" +
      "ceo -> cto\n" +
      "ceo -> cfo\n" +
      "ceo -> vp_sales\n" +
      "cto -> engineering\n" +
      "cto -> product\n" +
      "cfo -> finance\n" +
      "vp_sales -> sales\n" +
      "```\n\n" +
      "Return only valid D2 code without any additional comments or explanations.";
    } else {
      // System prompt for technical/migration diagrams
      systemPrompt = "You are an expert at creating network diagrams using the D2 language. " +
      "The user will provide a description of a diagram they want to create for RiverMeadow's cloud migration platform. " +
      "Generate a complete, valid D2 diagram script based on the user's description.\n\n" +
      "Important rules:\n" +
      "1. Use D2 language syntax, not mermaid or any other format.\n" +
      "2. Always include 'direction: right' as the first line to set layout direction.\n" +
      "3. Keep node definitions simple with just the label.\n" +
      "4. DO NOT use complex style attributes as they may not be compatible with our D2 version.\n" +
      "5. Always create connections between components using the -> operator.\n" +
      "6. DO NOT include a title block as our D2 version doesn't support it.\n" +
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
    }
    
    console.log(`Using ${isOrganizationDiagram ? 'organizational' : 'technical'} diagram system prompt`);
    
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