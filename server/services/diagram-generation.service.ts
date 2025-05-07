import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { saveDiagramToFile, drawioToSvg } from './drawio.service';

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Define the directories for storing files
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const GENERATED_DIR = path.join(UPLOADS_DIR, 'generated');
const SVG_DIR = path.join(UPLOADS_DIR, 'svg');

// Ensure directories exist
const ensureDirectoriesExist = async (): Promise<void> => {
  const dirs = [UPLOADS_DIR, GENERATED_DIR, SVG_DIR];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

/**
 * Generate a diagram using GPT based on the prompt
 */
export const generateDiagram = async (prompt: string): Promise<{
  fileName: string;
  svgPath: string;
  diagramType: string;
}> => {
  try {
    console.log(`Generating diagram for prompt: ${prompt}`);
    
    // Create a unique request ID
    const requestId = `${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    // First, analyze the prompt to identify diagram type
    const diagramType = await identifyDiagramType(prompt);
    console.log(`Identified diagram type: ${diagramType}`);
    
    // Then use GPT to generate diagram content based on the prompt and diagram type
    const diagramContent = await generateDiagramContent(prompt, diagramType);
    
    // Save the diagram to a file
    const fileName = await saveDiagramToFile(diagramContent);
    const filePath = path.join(GENERATED_DIR, fileName);
    
    // Generate an SVG version
    const svgContent = await drawioToSvg(filePath);
    const svgFileName = fileName.replace('.drawio', '.svg');
    const svgPath = path.join(SVG_DIR, svgFileName);
    
    return {
      fileName,
      svgPath: `/api/diagram-svg/${fileName}`,
      diagramType
    };
  } catch (error) {
    console.error('Error generating diagram:', error);
    throw new Error('Failed to generate diagram');
  }
};

/**
 * Identify the type of diagram to generate based on the prompt
 */
async function identifyDiagramType(prompt: string): Promise<string> {
  try {
    // Use GPT to identify what type of diagram to generate
    const response = await openai.chat.completions.create({
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a diagram classification expert. Analyze the user's request and identify 
          what type of diagram they want to create. Choose from these categories:
          - OS_MIGRATION: Operating system migration diagram
          - CLOUD_MIGRATION: Cloud migration diagram
          - AWS_ARCHITECTURE: AWS architecture diagram
          - AZURE_ARCHITECTURE: Azure architecture diagram
          - NETWORK_DIAGRAM: Network infrastructure diagram
          - WORKFLOW: Process/workflow diagram
          - GENERAL: General purpose diagram
          
          Respond with ONLY the category name, nothing else.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 50
    });
    
    // Extract and sanitize the diagram type
    const diagramType = response.choices[0].message.content?.trim() || "GENERAL";
    return diagramType;
  } catch (error) {
    console.error('Error identifying diagram type:', error);
    return "GENERAL"; // Default to general diagram type
  }
}

/**
 * Generate diagram content using GPT
 */
async function generateDiagramContent(prompt: string, diagramType: string): Promise<string> {
  try {
    // Prepare diagram creation instructions based on the diagram type
    const systemPrompt = getDiagramInstructions(diagramType);
    
    console.log(`Generating diagram content for type: ${diagramType}`);
    
    // Use GPT to generate XML content for a Draw.io diagram
    const response = await openai.chat.completions.create({
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `Create a diagram based on this request: "${prompt}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });
    
    const content = response.choices[0].message.content || "";
    
    // Extract the XML content (if embedded in markdown)
    const xmlContent = extractXmlContent(content);
    
    return xmlContent;
  } catch (error) {
    console.error('Error generating diagram content:', error);
    // Return a basic fallback diagram
    return createFallbackDiagram(prompt, diagramType);
  }
}

/**
 * Extract XML content from GPT response
 */
function extractXmlContent(content: string): string {
  // If response is already pure XML, return it
  if (content.trim().startsWith('<mxfile')) {
    return content;
  }
  
  // Try to extract XML from markdown code blocks
  const xmlMatch = content.match(/```xml\s*([\s\S]*?)\s*```/) || 
                   content.match(/```\s*([\s\S]*?<\/mxfile>[\s\S]*?)\s*```/);
  
  if (xmlMatch && xmlMatch[1] && xmlMatch[1].includes('<mxfile')) {
    return xmlMatch[1].trim();
  }
  
  // If no XML found, generate a basic diagram
  console.warn('No valid XML found in the response, using fallback');
  return createFallbackDiagram("Failed to extract diagram content", "GENERAL");
}

/**
 * Create a fallback diagram when generation fails
 */
function createFallbackDiagram(title: string, diagramType: string): string {
  const timestamp = new Date().toISOString();
  const diagramId = `fallback-${Date.now()}`;
  
  // Create a basic Draw.io diagram with error information
  return `
<mxfile host="app.diagrams.net" modified="${timestamp}" agent="RiverMeadow Agent" version="21.1.2">
  <diagram name="RiverMeadow ${diagramType} Diagram" id="${diagramId}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="850" background="#ffffff">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="2" value="&lt;font style=&quot;font-size: 24px&quot;&gt;${title}&lt;/font&gt;" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontStyle=1" vertex="1" parent="1">
          <mxGeometry x="275" y="40" width="550" height="40" as="geometry" />
        </mxCell>
        <mxCell id="3" value="&lt;font style=&quot;font-size: 18px&quot;&gt;Fallback Diagram (API Generation Failed)&lt;/font&gt;" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontColor=#CC0000" vertex="1" parent="1">
          <mxGeometry x="275" y="90" width="550" height="30" as="geometry" />
        </mxCell>
        <mxCell id="4" value="RiverMeadow Platform" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;shadow=1;fontSize=16;fontStyle=1" vertex="1" parent="1">
          <mxGeometry x="420" y="360" width="260" height="100" as="geometry" />
        </mxCell>
        <mxCell id="5" value="Source Environment" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;shadow=1;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="160" y="250" width="200" height="80" as="geometry" />
        </mxCell>
        <mxCell id="6" value="Target Environment" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;shadow=1;fontSize=14;" vertex="1" parent="1">
          <mxGeometry x="740" y="250" width="200" height="80" as="geometry" />
        </mxCell>
        <mxCell id="7" value="" style="endArrow=classic;html=1;rounded=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;exitX=1;exitY=0.5;exitDx=0;exitDy=0;strokeWidth=2;" edge="1" parent="1" source="5" target="4">
          <mxGeometry width="50" height="50" relative="1" as="geometry">
            <mxPoint x="230" y="430" as="sourcePoint" />
            <mxPoint x="280" y="380" as="targetPoint" />
          </mxGeometry>
        </mxCell>
        <mxCell id="8" value="" style="endArrow=classic;html=1;rounded=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;exitX=1;exitY=0.5;exitDx=0;exitDy=0;strokeWidth=2;" edge="1" parent="1" source="4" target="6">
          <mxGeometry width="50" height="50" relative="1" as="geometry">
            <mxPoint x="700" y="430" as="sourcePoint" />
            <mxPoint x="750" y="380" as="targetPoint" />
          </mxGeometry>
        </mxCell>
        <mxCell id="9" value="Migration Process" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=16;" vertex="1" parent="1">
          <mxGeometry x="390" y="470" width="320" height="30" as="geometry" />
        </mxCell>
        <mxCell id="10" value="Generated: ${timestamp}" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=bottom;whiteSpace=wrap;rounded=0;fontSize=10;fontColor=#999999" vertex="1" parent="1">
          <mxGeometry x="390" y="780" width="320" height="20" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
  `;
}

/**
 * Get diagram generation instructions based on diagram type
 */
function getDiagramInstructions(diagramType: string): string {
  const baseInstructions = `
You are an expert diagram creator specializing in clear, professional technical diagrams.
You create diagrams in the draw.io XML format.

Your task is to create a draw.io diagram based on the user's request.
The output should be ONLY the draw.io XML content that can be directly loaded into draw.io.
The XML should start with <mxfile> and end with </mxfile>.

EXTREMELY IMPORTANT: All connections between elements must be from border to border, NEVER center to center.
- Set all connections with attributes: exitX="1" exitY="0.5" entryX="0" entryY="0.5" (for side connections)
- For elements with connections above/below: exitX="0.5" exitY="0" entryX="0.5" entryY="1" 
- Always set source and target anchors at the border of shapes
- Ensure connector lines never cross through any objects

Here are some guidelines:
1. Use appropriate colors, shapes, and connectors
2. Include clear labels and titles
3. Organize the elements logically
4. Keep the diagram clean and easy to understand
5. Use shadows, gradients and other visual effects sparingly for a professional look
6. Set all connections with edge attribute: edge="1" to ensure proper routing

For RiverMeadow diagrams, use:
- Blue colors (#dae8fc fill, #6c8ebf border) for the RiverMeadow platform components
- Green colors (#d5e8d4 fill, #82b366 border) for source/target environments
- Orange colors (#ffe6cc fill, #d79b00 border) for important processes
- Yellow colors (#fff2cc fill, #d6b656 border) for notes or metadata
- Gray colors (#f5f5f5 fill, #666666 border) for external components

Respond ONLY with the draw.io XML content, without any explanations or markdown formatting.
`;

  // Add specialized instructions based on diagram type
  switch (diagramType) {
    case 'OS_MIGRATION':
      return baseInstructions + `
Focus on creating an Operating System migration diagram that shows:
- Source OS environment (typically on the left)
- Target OS environment (typically on the right)
- RiverMeadow Migration Platform in the center
- Clear migration paths with directional arrows connecting at the borders of shapes
- Key components like data transfer, configuration, and application migration
- Pre and post migration validation steps

IMPORTANT TECHNICAL DETAILS:
- Set exitX, exitY, entryX, entryY attributes on all connectors to force border connections
- For horizontal flow connections, use: exitX="1" exitY="0.5" entryX="0" entryY="0.5"
- Add sourcePerimeterSpacing="10" targetPerimeterSpacing="10" to create spacing between connectors and shapes
- Use edge="1" parent="1" on all connections
- All connections must be parent="1" to ensure they're rendered correctly
`;
    
    case 'CLOUD_MIGRATION':
      return baseInstructions + `
Focus on creating a Cloud Migration diagram that shows:
- Source environment (on-premises or other cloud)
- Target cloud environment
- RiverMeadow Migration Platform in the center facilitating the migration
- Migration paths for different workloads
- Security and networking considerations
- Integration points with cloud-native services

IMPORTANT TECHNICAL DETAILS:
- Set exitX, exitY, entryX, entryY attributes on all connectors to force border connections
- For horizontal flow connections, use: exitX="1" exitY="0.5" entryX="0" entryY="0.5"
- Add sourcePerimeterSpacing="10" targetPerimeterSpacing="10" to create spacing between connectors and shapes
- Use edge="1" parent="1" on all connections
`;
    
    case 'AWS_ARCHITECTURE':
      return baseInstructions + `
Focus on creating an AWS Architecture diagram that shows:
- Appropriate AWS service icons
- VPC structure with subnets and security groups
- AZs for high availability
- Load balancers and auto-scaling groups
- Storage solutions (S3, EBS, etc.)
- Integration with RiverMeadow migration services

IMPORTANT TECHNICAL DETAILS:
- Set exitX, exitY, entryX, entryY attributes on all connectors to force border connections
- For horizontal flow connections, use: exitX="1" exitY="0.5" entryX="0" entryY="0.5"
- Add sourcePerimeterSpacing="10" targetPerimeterSpacing="10" to create spacing
- Use edge="1" parent="1" on all connections
`;
    
    case 'AZURE_ARCHITECTURE':
      return baseInstructions + `
Focus on creating an Azure Architecture diagram that shows:
- Resource Groups and subscriptions
- Virtual Networks and subnets
- Azure services using appropriate icons
- Security perimeters
- Storage solutions
- Integration with RiverMeadow migration services

IMPORTANT TECHNICAL DETAILS:
- Set exitX, exitY, entryX, entryY attributes on all connectors to force border connections
- For horizontal flow connections, use: exitX="1" exitY="0.5" entryX="0" entryY="0.5"
- Add sourcePerimeterSpacing="10" targetPerimeterSpacing="10" to create spacing
- Use edge="1" parent="1" on all connections
`;
    
    case 'NETWORK_DIAGRAM':
      return baseInstructions + `
Focus on creating a Network diagram that shows:
- Network topology
- Firewalls, routers, and switches
- Subnets and IP addressing
- Traffic flows with directional arrows
- Security zones
- Load balancers and proxies

IMPORTANT TECHNICAL DETAILS:
- Set exitX, exitY, entryX, entryY attributes on all connectors to force border connections
- For horizontal flow connections, use: exitX="1" exitY="0.5" entryX="0" entryY="0.5"
- Add sourcePerimeterSpacing="10" targetPerimeterSpacing="10" to create spacing
- Use edge="1" parent="1" on all connections
`;
    
    case 'WORKFLOW':
      return baseInstructions + `
Focus on creating a Workflow diagram that shows:
- Sequential process steps
- Decision points
- Start and end points
- Swimlanes if multiple parties are involved
- Key milestones and deliverables
- Timelines if applicable

IMPORTANT TECHNICAL DETAILS:
- Set exitX, exitY, entryX, entryY attributes on all connectors to force border connections
- For horizontal flow connections, use: exitX="1" exitY="0.5" entryX="0" entryY="0.5"
- For vertical flow connections, use: exitX="0.5" exitY="1" entryX="0.5" entryY="0"
- Add sourcePerimeterSpacing="10" targetPerimeterSpacing="10" to create spacing
- Use edge="1" parent="1" on all connections
`;
    
    default: // GENERAL
      return baseInstructions + `
Create a diagram that best represents the user's request.
Use your judgment to select the appropriate diagram type and elements.
Make sure to include all relevant components and relationships.
`;
  }
}

/**
 * Check if a prompt is requesting diagram generation
 */
export const isDiagramGenerationRequest = (prompt: string): boolean => {
  const diagramKeywords = [
    'draw', 'create', 'generate', 'diagram', 'chart', 'graph',
    'flowchart', 'architecture', 'workflow', 'process flow',
    'network diagram', 'infrastructure diagram', 'migration diagram',
    'visualize', 'visualization', 'schematic', 'layout'
  ];
  
  // Convert prompt to lowercase for case-insensitive matching
  const lowerPrompt = prompt.toLowerCase();
  
  // Check for diagram keywords
  for (const keyword of diagramKeywords) {
    if (lowerPrompt.includes(keyword)) {
      return true;
    }
  }
  
  return false;
};