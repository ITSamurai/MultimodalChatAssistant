/**
 * Diagram Generation Service
 * 
 * This service handles the generation of diagrams using OpenAI's API
 * for intent understanding and D2 for diagram creation.
 */
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { saveD2Script, d2ToSvg, d2ToPng } from './d2.service';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
  // Keywords that might indicate a diagram request
  const diagramKeywords = [
    'diagram', 'chart', 'draw', 'visualize', 'visualise', 
    'illustrate', 'create a diagram', 'architecture', 'flow', 
    'topology', 'network', 'infrastructure', 'migration',
    'show me a diagram', 'can you draw', 'generate a diagram',
    'make a diagram', 'create a visualization', 'design a diagram',
    'migration diagram', 'workflow diagram', 'process diagram',
    'explain with a diagram', 'represent graphically'
  ];

  const messageLower = message.toLowerCase();
  
  // Check if any of the keywords are present in the message
  return diagramKeywords.some(keyword => messageLower.includes(keyword.toLowerCase()));
}

/**
 * Generates a D2 diagram script based on a user prompt
 */
export async function generateD2Script(prompt: string): Promise<{
  d2Script: string;
  diagramTitle: string;
}> {
  try {
    // Define a system prompt that guides the AI to generate a D2 script
    const systemPrompt = `
You are an expert RiverMeadow diagram creator. Generate structured D2 format diagrams based on user requests.

D2 diagram syntax guidelines:
- Use straightforward syntax: direction: right
- Define nodes with labels: aws: {label: "AWS Cloud"; shape: cloud}
- Create connections: aws -> onprem
- Style with colors: shape: circle; style.fill: blue
- Group related items: network: { server1; server2 }
- Support complex diagrams with nested structures
- Use cloud shapes for cloud platforms
- Use server shapes for servers
- Use cylindrical shapes for databases
- Include clear labels for all components
- Use appropriate colors for visual distinction
- Support both infrastructure and flow diagrams
- Keep the diagram clean and readable

For migration diagrams specifically:
- Show clear source and target environments
- Include migration paths with directional arrows
- Highlight key migration components
- Show data flow during migration
- Include relevant migration tools or services
- Use the RiverMeadow box as the central migration orchestrator when appropriate

ONLY output the complete D2 script and nothing else. Do not include explanations, comments or anything other than just the raw D2 syntax.
    `;

    // Use OpenAI to generate the diagram script
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. Do not change this unless explicitly requested by the user
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create a diagram based on this prompt: ${prompt}` }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    // Extract the D2 script from the completion
    const d2Script = completion.choices[0].message.content?.trim() || '';

    // Generate a title based on the prompt
    const titleCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "Generate a short, descriptive title (maximum 5-6 words) for a diagram based on the user's prompt. Return ONLY the title with no quotes or additional text." 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 50,
    });

    const diagramTitle = titleCompletion.choices[0].message.content?.trim() || 'Generated Diagram';

    return {
      d2Script,
      diagramTitle
    };
  } catch (error) {
    console.error('Error generating D2 script:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate D2 script: ${errorMessage}`);
  }
}

/**
 * Generates a diagram based on a user prompt
 */
export async function generateDiagram(prompt: string): Promise<DiagramGenerationResult> {
  try {
    // Generate the D2 script and title
    const { d2Script, diagramTitle } = await generateD2Script(prompt);
    
    // Create a sanitized identifier for the file
    const identifier = diagramTitle
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .substring(0, 40);
    
    // Save the D2 script to a file
    const d2Path = saveD2Script(d2Script, identifier);
    
    // Generate the SVG from the D2 script
    await d2ToSvg(d2Path);
    
    // Generate the PNG from the D2 script
    await d2ToPng(d2Path);
    
    // Determine the SVG and PNG paths
    const svgFileName = path.basename(d2Path, '.d2') + '.svg';
    const svgPath = path.join(process.cwd(), 'uploads', 'svg', svgFileName);
    
    const pngFileName = path.basename(d2Path, '.d2') + '.png';
    const pngPath = path.join(process.cwd(), 'uploads', 'png', pngFileName);
    
    return {
      success: true,
      diagramTitle,
      d2Path,
      svgPath,
      pngPath
    };
  } catch (error) {
    console.error('Error generating diagram:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate diagram: ${errorMessage}`);
  }
}