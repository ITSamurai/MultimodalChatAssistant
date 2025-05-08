/**
 * Intent Understanding Service
 * 
 * This service handles the conversion of user prompts into structured JSON metadata
 * using OpenAI's GPT models. It implements the Intent Understanding component of the architecture.
 */

import OpenAI from 'openai';
import { DiagramMetadata } from './diagram-schema.service';

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// The newest OpenAI model is "gpt-4o" which was released May 13, 2024
const MODEL = 'gpt-4o';

/**
 * Check if a prompt is requesting diagram generation
 */
export function isDiagramRequest(prompt: string): boolean {
  const diagramKeywords = [
    'diagram', 'chart', 'graph', 'flowchart', 'architecture', 
    'draw', 'visualize', 'visualise', 'map', 'workflow', 
    'process flow', 'sequence diagram', 'network diagram'
  ];
  
  const lowercasePrompt = prompt.toLowerCase();
  return diagramKeywords.some(keyword => lowercasePrompt.includes(keyword));
}

/**
 * Generate diagram metadata from a user prompt using GPT
 */
export async function generateDiagramMetadata(prompt: string): Promise<DiagramMetadata> {
  try {
    // Create the system message to guide GPT's response format
    const systemMessage = `You are a diagram schema generator. Your task is to analyze the user's request for a diagram and extract the key components needed to generate it. Return ONLY a JSON object with the following structure:

{
  "title": "Brief descriptive title for the diagram",
  "nodes": ["Node 1", "Node 2", "Node 3", ...], // List of all components/elements to include
  "connections": [
    {"from": "Node 1", "to": "Node 2", "label": "Optional description of this connection"},
    ...
  ],
  "categories": { // Optional grouping of related items
    "Category 1": ["Item A", "Item B"],
    "Category 2": ["Item C", "Item D"]
  },
  "layoutHints": { // Optional layout suggestions for the diagram
    "direction": "TB", // Direction: TB (top-bottom), BT (bottom-top), LR (left-right), RL (right-left)
    "spacing": "normal", // Spacing between nodes: "compact", "normal", or "wide"
    "style": "modern", // Visual style: "modern", "technical", "minimal", or "colorful"
    "emphasize": ["Node 2"], // List of important nodes to highlight
    "group": { // Visual clustering of related nodes
      "Group Name": ["Node 1", "Node 3"],
      "Another Group": ["Node 4", "Node 5"]
    }
  }
}

Always respond with valid JSON, nothing else. Do not include any explanatory text.
For RiverMeadow-related diagrams, include appropriate components like "Source VM", "Migration Agent", "Target VM", etc.
Always include layout hints to improve the diagram's readability, with appropriate direction based on the type of diagram (e.g. LR for process flows, TB for hierarchies).`;

    // Make the API call to OpenAI
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: 'json_object' }
    });

    // Parse the response to get the JSON data
    const content = response.choices[0].message.content;
    
    if (!content) {
      throw new Error('Empty response from GPT');
    }
    
    // Parse and validate the JSON
    const parsedData = JSON.parse(content) as DiagramMetadata;
    
    // Basic validation
    if (!parsedData.title || !parsedData.nodes || !parsedData.connections) {
      throw new Error('Invalid diagram metadata format');
    }
    
    // Additional validation
    if (!Array.isArray(parsedData.nodes) || parsedData.nodes.length === 0) {
      throw new Error('Diagram must have at least one node');
    }
    
    if (!Array.isArray(parsedData.connections)) {
      throw new Error('Connections must be an array');
    }
    
    return parsedData;
  } catch (error) {
    console.error('Error generating diagram metadata:', error);
    throw new Error('Failed to generate diagram metadata from prompt');
  }
}

/**
 * Generate a fallback diagram metadata when GPT fails
 */
export function generateFallbackMetadata(prompt: string): DiagramMetadata {
  // Extract a title from the prompt
  const title = prompt.length > 50 
    ? `${prompt.substring(0, 47)}...` 
    : prompt;
  
  // Create simple fallback metadata with layout hints
  return {
    title: `Diagram: ${title}`,
    nodes: ['Source System', 'RiverMeadow Platform', 'Target System'],
    connections: [
      { from: 'Source System', to: 'RiverMeadow Platform', label: 'Migration Data' },
      { from: 'RiverMeadow Platform', to: 'Target System', label: 'Deployment' }
    ],
    categories: {
      'Migration Components': ['Source System', 'RiverMeadow Platform', 'Target System']
    },
    layoutHints: {
      direction: 'LR',
      spacing: 'normal',
      style: 'modern',
      emphasize: ['RiverMeadow Platform'],
      group: {
        'Migration Environment': ['Source System', 'Target System']
      }
    }
  };
}