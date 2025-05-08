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
import { storage } from '../storage';

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
  
  // Special case for requests about diagram generation based on information
  if (lowerMessage.includes('generate') && lowerMessage.includes('diagram') && lowerMessage.includes('based on')) {
    console.log(`Detected diagram request with "generate diagram based on" pattern`);
    return true;
  }
  
  // Special case for application structure
  if (lowerMessage.includes('application') && lowerMessage.includes('structure')) {
    console.log(`Detected application structure diagram request`);
    return true;
  }
  
  // Special case for RiverMeadow specific diagram requests
  if (lowerMessage.includes('rivermeadow') && 
      (lowerMessage.includes('structure') || 
       lowerMessage.includes('architecture') || 
       lowerMessage.includes('application') || 
       lowerMessage.includes('system') || 
       lowerMessage.includes('software'))) {
    console.log(`Detected RiverMeadow application/system structure diagram request`);
    return true;
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
    // Determine what type of diagram is being requested
    const isOrganizationDiagram = prompt.toLowerCase().includes('organization') || 
                                  prompt.toLowerCase().includes('hierarchy') || 
                                  prompt.toLowerCase().includes('company structure') || 
                                  prompt.toLowerCase().includes('team structure');
    
    const isApplicationStructure = prompt.toLowerCase().includes('application structure') || 
                                   prompt.toLowerCase().includes('software structure') || 
                                   prompt.toLowerCase().includes('system structure') || 
                                   prompt.toLowerCase().includes('architecture diagram') || 
                                   prompt.toLowerCase().includes('based on that information');
    
    let systemPrompt;
    
    if (isApplicationStructure) {
      // System prompt for application/software structure diagrams
      systemPrompt = "You are an expert at creating software architecture diagrams using the D2 language. " +
      "The user is requesting a diagram of RiverMeadow's application structure, software components, or system architecture. " +
      "Generate a complete, valid D2 diagram script that represents RiverMeadow's cloud migration software architecture.\n\n" +
      "Important rules:\n" +
      "1. Use D2 language syntax, not mermaid or any other format.\n" +
      "2. For application architecture diagrams, use 'direction: down' as the first line.\n" +
      "3. Keep node definitions simple with just the label.\n" +
      "4. DO NOT use complex style attributes as they may not be compatible with our D2 version.\n" +
      "5. Use -> for connections between components to show data flow or dependencies.\n" +
      "6. DO NOT include a title block as our D2 version doesn't support it.\n" +
      "7. Include all key RiverMeadow application components mentioned below.\n\n" +
      "Example D2 application structure diagram for RiverMeadow:\n" +
      "```\n" +
      "direction: down\n\n" +
      "web_dashboard: \"RiverMeadow Web Dashboard\"\n" +
      "auth_service: \"Authentication Service\"\n" +
      "api_gateway: \"API Gateway\"\n" +
      "migration_orchestrator: \"Migration Orchestrator\"\n" +
      "discovery_service: \"Discovery Service\"\n" +
      "migration_engine: \"Migration Engine\"\n" +
      "aws_connector: \"AWS Connector\"\n" +
      "azure_connector: \"Azure Connector\"\n" +
      "gcp_connector: \"GCP Connector\"\n" +
      "vmware_connector: \"VMware Connector\"\n" +
      "database: \"Migration Database\"\n" +
      "storage_service: \"Storage Service\"\n" +
      "monitoring: \"Monitoring & Alerting\"\n\n" +
      "web_dashboard -> auth_service\n" +
      "web_dashboard -> api_gateway\n" +
      "api_gateway -> migration_orchestrator\n" +
      "api_gateway -> discovery_service\n" +
      "migration_orchestrator -> migration_engine\n" +
      "migration_engine -> aws_connector\n" +
      "migration_engine -> azure_connector\n" +
      "migration_engine -> gcp_connector\n" +
      "migration_engine -> vmware_connector\n" +
      "migration_engine -> storage_service\n" +
      "discovery_service -> aws_connector\n" +
      "discovery_service -> azure_connector\n" +
      "discovery_service -> gcp_connector\n" +
      "discovery_service -> vmware_connector\n" +
      "migration_orchestrator -> database\n" +
      "discovery_service -> database\n" +
      "monitoring -> web_dashboard\n" +
      "monitoring -> api_gateway\n" +
      "monitoring -> migration_engine\n" +
      "```\n\n" +
      "RiverMeadow's cloud migration platform includes these key components:\n" +
      "- Web Dashboard: User interface for migration management\n" +
      "- Authentication Service: Handles user auth and permissions\n" +
      "- API Gateway: Central entry point for all API requests\n" +
      "- Migration Orchestrator: Coordinates the migration workflow\n" +
      "- Discovery Service: Analyzes source environments\n" +
      "- Migration Engine: Core service that performs the actual migration\n" +
      "- Cloud Provider Connectors: Interface with AWS, Azure, GCP, VMware\n" +
      "- Storage Service: Manages VM disk images and snapshots\n" +
      "- Migration Database: Stores migration metadata and state\n" +
      "- Monitoring & Alerting: Tracks system health and migration progress\n\n" +
      "Return only valid D2 code without any additional comments or explanations.";
    } else if (isOrganizationDiagram) {
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
      "2. Start with a layout configuration block at the top with these fields:\n" +
      "   - direction: 'right' or 'down' based on what would be most appropriate for this diagram\n" +
      "   - layout.rankSep: a number in pixels that provides good spacing between elements (usually 50-100)\n" +
      "3. Include a basic style block to enhance visual appearance:\n" +
      "   style.fill: '#f5f5f5'  # A light background color\n" +
      "   style.stroke: '#333333'  # A dark border color\n" +
      "   style.font-size: 14  # For readable text\n" +
      "   style.border-radius: 4  # For slightly rounded corners\n" +
      "4. Keep node definitions simple with just the label.\n" +
      "5. Always create connections between components using the -> operator.\n" +
      "6. DO NOT include a title block as our D2 version doesn't support it.\n" +
      "7. Keep the diagram focused and not too complex (max 10-15 elements).\n\n" +
      "Example D2 diagram:\n" +
      "```\n" +
      "direction: right\n" +
      "@new_diagram: {\n" +
      "  layout: {\n" +
      "    rankSep: 80\n" +
      "  }\n" +
      "}\n\n" +
      "# General style for all elements\n" +
      "style {\n" +
      "  fill: \"#f5f5f5\"\n" +
      "  stroke: \"#333333\"\n" +
      "  font-size: 14\n" +
      "  border-radius: 4\n" +
      "}\n\n" +
      "# Optional custom styles for specific node types\n" +
      "source: \"Source Environment\" {\n" +
      "  style.fill: \"#e6f7ff\"\n" +
      "  style.stroke: \"#1890ff\"\n" +
      "}\n\n" +
      "target: \"Target Cloud\" {\n" +
      "  style.fill: \"#f6ffed\"\n" +
      "  style.stroke: \"#52c41a\"\n" +
      "}\n\n" +
      "rivermeadow: \"RiverMeadow SaaS\"\n" +
      "discovery: \"Discovery\"\n" +
      "migration: \"Migration\"\n\n" +
      "source -> discovery -> rivermeadow -> migration -> target\n" +
      "```\n\n" +
      "Return only valid D2 code without any additional comments or explanations.";
    }
    
    if (isApplicationStructure) {
      console.log('Using application structure diagram system prompt');
    } else if (isOrganizationDiagram) {
      console.log('Using organizational diagram system prompt');
    } else {
      console.log('Using technical diagram system prompt');
    }
    
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
    let { script, title } = await generateD2Script(prompt);
    
    // Save the script to a file
    const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const d2FilePath = saveD2Script(script, sanitizedTitle);
    
    // Get configuration settings for D2
    const config = await storage.getConfig();
    
    // Style presets from user configuration
    const sourceFill = config.d2_source_fill || "#e6f7ff";
    const sourceStroke = config.d2_source_stroke || "#1890ff";
    const targetFill = config.d2_target_fill || "#f6ffed";
    const targetStroke = config.d2_target_stroke || "#52c41a";
    
    // Look for source/target nodes in the D2 script, but be more careful with replacements
    // We need to ensure we don't create invalid D2 syntax
    
    // For source nodes, add styling inside existing blocks or create blocks
    if (script.includes("source:")) {
      // Match source: "Name" pattern but not if it already has a style block
      script = script.replace(/source:\s*"([^"]+)"\s*(?!\{)/g, `source: "$1" {\n  style.fill: "${sourceFill}"\n  style.stroke: "${sourceStroke}"\n}`);
      
      // Fix any potential double-bracket issue (source: "Name" { ... } { ... })
      script = script.replace(/source:\s*"([^"]+)"\s*\{([^}]*)\}\s*\{/g, `source: "$1" {\n$2\n  style.fill: "${sourceFill}"\n  style.stroke: "${sourceStroke}"\n`);
    }
    
    // For target nodes, add styling inside existing blocks or create blocks
    if (script.includes("target:")) {
      // Match target: "Name" pattern but not if it already has a style block
      script = script.replace(/target:\s*"([^"]+)"\s*(?!\{)/g, `target: "$1" {\n  style.fill: "${targetFill}"\n  style.stroke: "${targetStroke}"\n}`);
      
      // Fix any potential double-bracket issue (target: "Name" { ... } { ... })
      script = script.replace(/target:\s*"([^"]+)"\s*\{([^}]*)\}\s*\{/g, `target: "$1" {\n$2\n  style.fill: "${targetFill}"\n  style.stroke: "${targetStroke}"\n`);
    }
    
    // Fix any potential spacing issues in the D2 script
    script = fixD2SpacingIssues(script);
    
    // Update the file with the modified script
    saveD2Script(script, sanitizedTitle);
    
    // Prepare D2 options based on configuration settings
    const d2Options = {
      theme: parseInt(config.d2_theme ?? "0", 10),
      darkTheme: parseInt(config.d2_dark_theme ?? "-1", 10),
      layout: config.d2_layout || "dagre",
      sketchMode: config.d2_sketch_mode === true,
      pad: parseInt(config.d2_pad ?? "100", 10),
      containerBgColor: config.d2_container_bg_color || "#ffffff"
    };
    
    console.log("Using D2 rendering options:", d2Options);
    
    // Generate SVG from the D2 script with configuration options
    const svgContent = await d2ToSvg(d2FilePath, d2Options);
    
    // Derive the SVG file path from the D2 file path
    const svgFileName = path.basename(d2FilePath, '.d2') + '.svg';
    const svgFilePath = path.join(process.cwd(), 'uploads', 'svg', svgFileName);
    
    // Derive the PNG file path
    const pngFileName = path.basename(d2FilePath, '.d2') + '.png';
    const pngFilePath = path.join(process.cwd(), 'uploads', 'png', pngFileName);
    
    // Save the SVG to file
    fs.writeFileSync(svgFilePath, svgContent);
    
    // Trigger PNG generation (this happens asynchronously)
    d2ToPng(d2FilePath, d2Options).then(pngBuffer => {
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