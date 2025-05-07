/**
 * Diagram Generation Service
 * 
 * This service handles the generation of diagrams using OpenAI's API
 * for intent understanding and D2 for diagram creation.
 */

import * as path from 'path';
import OpenAI from 'openai';
import { saveD2Script, d2ToSvg, d2ToPng } from './d2.service';

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Interface for diagram generation results
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
  const message_lower = message.toLowerCase();
  
  // Check for direct diagram-related keywords
  const diagramKeywords = [
    'create diagram', 'generate diagram', 'make diagram',
    'draw diagram', 'diagram of', 'diagram for',
    'create a diagram', 'generate a diagram', 'make a diagram',
    'draw a diagram', 'visualize', 'visualization',
    'flow chart', 'flowchart', 'architecture diagram', 
    'network diagram', 'system diagram', 'migration diagram',
    'process flow', 'workflow diagram'
  ];
  
  // Return true if any of the diagram keywords are present
  return diagramKeywords.some(keyword => message_lower.includes(keyword));
}

/**
 * Generates a D2 diagram script based on a user prompt
 */
export async function generateD2Script(prompt: string): Promise<{
  script: string;
  title: string;
}> {
  try {
    console.log('Generating D2 script for prompt:', prompt);
    
    // Create system prompt for D2 script generation
    const systemPrompt = `
      You are an expert diagram generator that creates D2 scripts (https://d2lang.com/).
      When given a request to create a diagram, you will ONLY output valid D2 script code
      that can be processed by the D2 CLI tool.
      
      Guidelines:
      1. Always include a title for the diagram using D2 comments (# Title)
      2. Use appropriate shapes, colors, and styles to make the diagram visually appealing
      3. Create proper connections between diagram elements with arrows
      4. Group related items using containers where appropriate
      5. Use styles consistent with professional technical diagrams
      6. For cloud migration diagrams, show source environment, migration process, and target environment
      7. For architecture diagrams, include all essential components and their relationships
      8. Output ONLY valid D2 code without any explanations or markdown
      
      D2 Example:
      
      # Cloud Migration Architecture
      
      source: {
        shape: cloud
        label: "Source Environment"
        style: {
          fill: "#f5f5f5"
          stroke: "#6c757d"
        }
        
        vm1: {
          shape: rectangle
          label: "VM1\\nApplication Server"
          style: {
            fill: "#e6f7ff"
            stroke: "#1890ff"
          }
        }
        
        vm2: {
          shape: rectangle
          label: "VM2\\nDatabase Server"
          style: {
            fill: "#e6f7ff"
            stroke: "#1890ff"
          }
        }
      }
      
      migration: {
        shape: circle
        label: "RiverMeadow\\nMigration Platform"
        style: {
          fill: "#fff2e8"
          stroke: "#fa8c16"
        }
      }
      
      target: {
        shape: cloud
        label: "Target Environment"
        style: {
          fill: "#f6ffed"
          stroke: "#52c41a"
        }
        
        cloud_vm1: {
          shape: rectangle
          label: "Cloud VM1\\nApplication Server"
          style: {
            fill: "#f6ffed"
            stroke: "#52c41a"
          }
        }
        
        cloud_vm2: {
          shape: rectangle
          label: "Cloud VM2\\nDatabase Server"
          style: {
            fill: "#f6ffed"
            stroke: "#52c41a"
          }
        }
      }
      
      source.vm1 -> migration: "Discovery"
      source.vm2 -> migration: "Discovery"
      migration -> target.cloud_vm1: "Transform & Deploy"
      migration -> target.cloud_vm2: "Transform & Deploy"
    `;
    
    // Create the OpenAI request
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create a D2 diagram for: ${prompt}` }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });
    
    // Extract the D2 script from the response
    const d2Script = response.choices[0].message.content?.trim() || '';
    
    // Extract the title from the D2 script (first line with # is usually the title)
    const titleMatch = d2Script.match(/^#\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : 'Generated Diagram';
    
    return {
      script: d2Script,
      title
    };
  } catch (error) {
    console.error('Error generating D2 script:', error);
    
    // Return a simple default D2 script as fallback
    return {
      script: `
# Error Generating Diagram

error: {
  shape: hexagon
  label: "Error Generating Diagram"
  style: {
    fill: "#fff0f0"
    stroke: "#ff4d4f"
  }
  
  message: {
    shape: rectangle
    label: "Failed to generate D2 script\\nfor this request"
    style: {
      fill: "#fff0f0"
      stroke: "#ff4d4f"
    }
  }
}
`,
      title: 'Error Generating Diagram'
    };
  }
}

/**
 * Generates a diagram based on a user prompt
 */
export async function generateDiagram(prompt: string): Promise<DiagramGenerationResult> {
  try {
    // Step 1: Generate the D2 script and title from the prompt
    const { script, title } = await generateD2Script(prompt);
    
    // Step 2: Save the D2 script to a file
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const d2Path = saveD2Script(script, sanitizedTitle);
    
    // Step 3: Convert the D2 script to SVG
    await d2ToSvg(d2Path);
    
    // Step 4: Convert the D2 script to PNG
    await d2ToPng(d2Path);
    
    // Step 5: Construct the file paths
    const baseName = path.basename(d2Path, '.d2');
    const svgPath = path.join(process.cwd(), 'uploads', 'svg', `${baseName}.svg`);
    const pngPath = path.join(process.cwd(), 'uploads', 'png', `${baseName}.png`);
    
    // Return the result
    return {
      success: true,
      diagramTitle: title,
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