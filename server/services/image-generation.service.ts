import { writeFile, mkdir } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from "openai";
import { storage } from '../storage';

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Define the directories for storing images
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const GENERATED_IMAGES_DIR = path.join(UPLOADS_DIR, 'generated');
const PNG_DIR = path.join(UPLOADS_DIR, 'png');

/**
 * Create necessary directories for storing images
 */
const ensureDirectoriesExist = async () => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR);
    }
    if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
      await mkdir(GENERATED_IMAGES_DIR);
    }
    if (!fs.existsSync(PNG_DIR)) {
      await mkdir(PNG_DIR);
    }
  } catch (error) {
    console.error('Error creating directories:', error);
  }
};

/**
 * Completely revised diagram categorization that uses both the prompt content,
 * context from the knowledge base, and randomized elements to ensure
 * each diagram is unique
 */
/**
 * Categorize diagram type based on prompt and knowledge context
 * Enhanced to create more diverse and unique diagram specifications
 */
const categorizeDiagramType = (prompt: string, contextSnippets: string[] = []): {
  category: string;
  specificType: string;
  colors: { primary: string; secondary: string; accent: string };
  elements: string[];
  layout: string;
  title: string;
  uniqueId: string;
} => {
  const lowercasePrompt = prompt.toLowerCase();
  
  // Get all contextual terms to help customize the diagram
  const combinedContext = contextSnippets.join(' ').toLowerCase();
  
  // Extract key technical terms from context
  const extractedTerms = extractTechnicalTerms(combinedContext);
  console.log('Extracted technical terms from context:', extractedTerms.slice(0, 10));
  
  // Add current timestamp to randomization factors to ensure uniqueness
  const timestamp = Date.now();
  // Use a combination of timestamp and multiple random seeds for stronger uniqueness
  const uniqueId = `${timestamp}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 6)}`;
  
  // Use timestamp to influence random selections to ensure diagrams vary over time
  const hourBasedRandomSeed = new Date().getHours() + (new Date().getMinutes() / 60);
  
  // Create rich categorization system with highly unique options
  const diagramTypes = [
    // Network & Infrastructure
    {
      category: 'network',
      keywords: ['network', 'infrastructure', 'cloud', 'aws', 'azure', 'gcp', 'server', 'topology', 'connectivity'],
      specificTypes: [
        'cloud-migration-architecture', 
        'hybrid-network-topology', 
        'data-center-infrastructure', 
        'secure-network-design',
        'multi-cloud-deployment',
        'containerized-services-architecture',
        'edge-computing-topology',
        'disaster-recovery-infrastructure'
      ],
      colorSets: [
        { primary: '#4285F4', secondary: '#34A853', accent: '#EA4335' }, // Google-inspired
        { primary: '#0078D4', secondary: '#50E6FF', accent: '#D83B01' }, // Azure-inspired
        { primary: '#232F3E', secondary: '#FF9900', accent: '#7D8998' }, // AWS-inspired
        { primary: '#0747A6', secondary: '#36B37E', accent: '#FF5630' }, // Atlassian-inspired
        { primary: '#20123A', secondary: '#5F249F', accent: '#E01E5A' }, // Modern dark purple
        { primary: '#1A73E8', secondary: '#34A853', accent: '#FBBC05' }, // Material inspired
        { primary: '#003366', secondary: '#FF9900', accent: '#66CCFF' }, // Navy and orange
        { primary: '#2D3748', secondary: '#48BB78', accent: '#F56565' }  // Dark mode inspired
      ],
      elementSets: [
        ['servers', 'cloud services', 'firewalls', 'load balancers', 'VPNs'],
        ['virtual machines', 'security groups', 'subnets', 'storage', 'databases'],
        ['containers', 'APIs', 'gateways', 'CDN', 'edge locations'],
        ['microservices', 'IAM roles', 'availability zones', 'NAT gateways', 'VPC endpoints'],
        ['clusters', 'nodes', 'pods', 'network policies', 'service mesh'],
        ['compute instances', 'storage buckets', 'managed services', 'identity providers', 'elastic scaling']
      ],
      layouts: ['horizontal', 'vertical', 'hierarchical', 'hub-and-spoke', 'segmented', 'zoned', 'layered', 'distributed']
    },
    
    // Process & Workflow 
    {
      category: 'process',
      keywords: ['process', 'workflow', 'steps', 'procedure', 'flowchart', 'sequence', 'assessment', 'pipeline'],
      specificTypes: [
        'migration-workflow', 
        'assessment-decision-tree', 
        'deployment-process', 
        'validation-pipeline',
        'continuous-integration-flow',
        'approval-gates-workflow',
        'maintenance-procedure',
        'audit-compliance-process',
        'risk-assessment-framework',
        'release-management-cycle'
      ],
      colorSets: [
        { primary: '#3498DB', secondary: '#2ECC71', accent: '#E74C3C' }, // Flat UI colors
        { primary: '#8E44AD', secondary: '#F1C40F', accent: '#16A085' }, // Purple and teal
        { primary: '#2C3E50', secondary: '#E67E22', accent: '#ECF0F1' }, // Dark blue and orange
        { primary: '#6366F1', secondary: '#10B981', accent: '#F59E0B' }, // Indigo and emerald
        { primary: '#7C3AED', secondary: '#EC4899', accent: '#FBBF24' }, // Purple and pink
        { primary: '#1E40AF', secondary: '#047857', accent: '#B45309' }, // Dark blue and green
        { primary: '#374151', secondary: '#9CA3AF', accent: '#F87171' }, // Gray scale with red
        { primary: '#4338CA', secondary: '#8B5CF6', accent: '#EC4899' }  // Purple gradient
      ],
      elementSets: [
        ['decision points', 'actions', 'inputs/outputs', 'start/end points'],
        ['validation steps', 'conditional branches', 'loops', 'subprocess blocks'],
        ['system interactions', 'user actions', 'data transformations', 'notifications'],
        ['status checks', 'approval gates', 'rollback procedures', 'verification steps'],
        ['data collection', 'analysis', 'reporting', 'decision making', 'implementation'],
        ['planning', 'execution', 'monitoring', 'control', 'closure'],
        ['requirements', 'design', 'development', 'testing', 'deployment', 'maintenance'],
        ['initiation', 'discovery', 'migration planning', 'validation', 'cutover', 'hypercare']
      ],
      layouts: ['top-down', 'left-to-right', 'swim lanes', 'circular', 'matrix', 'timeline', 'radial', 'spiral']
    },
    
    // Software Architecture
    {
      category: 'software',
      keywords: ['software', 'application', 'program', 'code', 'component', 'architecture', 'system', 'integration'],
      specificTypes: [
        'microservice-architecture', 
        'component-diagram', 
        'system-integration-map', 
        'data-flow-architecture',
        'event-driven-architecture',
        'domain-driven-design',
        'api-gateway-pattern',
        'service-mesh-topology',
        'hexagonal-architecture',
        'cqrs-event-sourcing',
        'distributed-system-overview'
      ],
      colorSets: [
        { primary: '#6236FF', secondary: '#41B883', accent: '#FF5757' }, // Purple and green
        { primary: '#61DAFB', secondary: '#F9A825', accent: '#6D4C41' }, // React blue and amber
        { primary: '#7E57C2', secondary: '#26A69A', accent: '#EF5350' }, // Purple and teal
        { primary: '#3B82F6', secondary: '#10B981', accent: '#F97316' }, // Blue and green
        { primary: '#8B5CF6', secondary: '#06B6D4', accent: '#F43F5E' }, // Violet and cyan
        { primary: '#1D4ED8', secondary: '#059669', accent: '#EA580C' }, // Royal blue and emerald
        { primary: '#4F46E5', secondary: '#0EA5E9', accent: '#F59E0B' }, // Indigo and sky
        { primary: '#6D28D9', secondary: '#0D9488', accent: '#DC2626' }  // Purple and teal red
      ],
      elementSets: [
        ['services', 'APIs', 'databases', 'user interfaces', 'external systems'],
        ['modules', 'libraries', 'data stores', 'message queues', 'caches'],
        ['controllers', 'models', 'views', 'middleware', 'authentication'],
        ['microservices', 'service registry', 'api gateway', 'circuit breaker', 'load balancer'],
        ['data sources', 'transformations', 'aggregations', 'analytics', 'visualizations'],
        ['event producers', 'event bus', 'event consumers', 'command handlers', 'query handlers'],
        ['frontend', 'backend', 'databases', 'caching', 'monitoring', 'logging'],
        ['clients', 'services', 'repositories', 'domain models', 'infrastructure']
      ],
      layouts: ['layered', 'component-based', 'service-oriented', 'event-driven', 'hexagonal', 'onion', 'clean', 'modular']
    },
    
    // Migration Related
    {
      category: 'migration',
      keywords: ['migration', 'move', 'transfer', 'transition', 'shift', 'transform', 'modernize', 'convert'],
      specificTypes: [
        'os-transformation-process', 
        'cross-platform-migration', 
        'application-compatibility-workflow', 
        'os-upgrade-lifecycle',
        'big-bang-migration-approach',
        'phased-migration-strategy',
        'parallel-run-migration',
        'lift-and-shift-migration',
        'replatform-migration',
        'refactor-migration',
        'datacenter-evacuation-plan'
      ],
      colorSets: [
        { primary: '#0078D4', secondary: '#107C10', accent: '#D83B01' }, // Windows-inspired
        { primary: '#E95420', secondary: '#77216F', accent: '#F2C500' }, // Ubuntu-inspired
        { primary: '#4285F4', secondary: '#34A853', accent: '#FBBC05' }, // Chrome OS-inspired
        { primary: '#2563EB', secondary: '#DC2626', accent: '#16A34A' }, // Primary colors
        { primary: '#0F172A', secondary: '#334155', accent: '#F97316' }, // Dark slate with orange
        { primary: '#5046E4', secondary: '#F000B8', accent: '#2DD4BF' }, // Electric purple and pink
        { primary: '#2D3748', secondary: '#CBD5E0', accent: '#F56565' }, // Dark gray with red
        { primary: '#312E81', secondary: '#6366F1', accent: '#EC4899' }  // Indigo with pink
      ],
      elementSets: [
        ['source', 'target', 'application compatibility', 'data migration', 'testing'],
        ['assessment', 'planning', 'execution', 'validation', 'cutover', 'hypercare'],
        ['user profiles', 'settings', 'drivers', 'services', 'security', 'applications'],
        ['infrastructure', 'middleware', 'data', 'applications', 'security', 'operations'],
        ['discovery', 'analysis', 'design', 'build', 'test', 'deploy', 'operate'],
        ['pre-migration', 'migration', 'post-migration', 'optimization', 'decommission'],
        ['source environment', 'migration tools', 'network transfer', 'target environment', 'verification'],
        ['legacy systems', 'migration appliance', 'staging area', 'new platform', 'rollback mechanism']
      ],
      layouts: ['migration path', 'parallel tracks', 'staged approach', 'automated pipeline', 'phased timeline', 'waterfall', 'hybrid', 'matrix']
    },
    
    // Cloud Specific
    {
      category: 'cloud',
      keywords: ['cloud', 'aws', 'azure', 'gcp', 'saas', 'paas', 'iaas', 'serverless', 'virtualization'],
      specificTypes: [
        'multi-cloud-strategy',
        'cloud-native-architecture',
        'serverless-computing-model',
        'cloud-security-framework',
        'hybrid-cloud-deployment',
        'cloud-cost-optimization',
        'high-availability-cloud-design',
        'cloud-disaster-recovery',
        'cloud-to-cloud-migration-flow',
        'cloud-workload-migration'
      ],
      colorSets: [
        { primary: '#FF9900', secondary: '#232F3E', accent: '#FF4F8B' }, // AWS-inspired
        { primary: '#0078D4', secondary: '#50E6FF', accent: '#D83B01' }, // Azure-inspired
        { primary: '#4285F4', secondary: '#34A853', accent: '#FBBC05' }, // GCP-inspired
        { primary: '#2E51A3', secondary: '#3E8DDD', accent: '#FF6B6B' }, // Blue cloud theme
        { primary: '#1A365D', secondary: '#2C5282', accent: '#7B9CFF' }, // Deep blue cloud
        { primary: '#00A4BD', secondary: '#7B848C', accent: '#FF8200' }, // Teal and orange
        { primary: '#6236FF', secondary: '#9C77FF', accent: '#41B883' }, // Purple cloud
        { primary: '#38B2AC', secondary: '#805AD5', accent: '#F56565' }  // Teal and purple
      ],
      elementSets: [
        ['cloud providers', 'regions', 'availability zones', 'services', 'networking'],
        ['compute', 'storage', 'database', 'networking', 'security', 'identity'],
        ['infrastructure', 'platform', 'applications', 'data', 'functions', 'containers'],
        ['public cloud', 'private cloud', 'hybrid connection', 'on-premises systems', 'edge'],
        ['front-end services', 'middleware', 'back-end services', 'data storage', 'analytics'],
        ['virtual machines', 'kubernetes clusters', 'serverless functions', 'managed services', 'identity providers'],
        ['cloud connector', 'migration service', 'replication', 'transformation', 'validation'],
        ['source cloud', 'migration tool', 'transit network', 'target cloud', 'monitoring']
      ],
      layouts: ['provider-based', 'service-oriented', 'regional', 'global', 'multi-region', 'zonal', 'hybrid', 'distributed']
    }
  ];
  
  // Calculate base scores based on keyword presence
  const baseScores = diagramTypes.map(type => {
    const keywordMatches = type.keywords.filter(keyword => lowercasePrompt.includes(keyword)).length;
    return {
      category: type,
      keywordScore: keywordMatches,
    };
  });
  
  // Add context-based scoring from knowledge base
  const contextualScores = baseScores.map(score => {
    const contextMatchScore = score.category.keywords.filter(keyword => 
      combinedContext.includes(keyword)
    ).length * 0.5; // Weight context matches less than direct prompt matches
    
    return {
      ...score,
      contextScore: contextMatchScore,
      // Add randomization to prevent same diagram generation
      randomFactor: Math.random() * 0.8, // Significant random factor
      totalScore: score.keywordScore + contextMatchScore + (Math.random() * 0.8)
    };
  });
  
  // Log detailed scoring to help debug
  console.log('Detailed category scoring:');
  contextualScores.forEach(cat => {
    console.log(`${cat.category.category}: Keywords=${cat.keywordScore}, Context=${cat.contextScore.toFixed(2)}, Random=${cat.randomFactor.toFixed(2)}, Total=${cat.totalScore.toFixed(2)}`);
  });
  
  // Find highest scoring category with randomization to ensure variety
  contextualScores.sort((a, b) => b.totalScore - a.totalScore);
  
  // Occasionally pick second-best category for more variety (20% chance)
  const categoryIndex = (Math.random() < 0.2 && contextualScores.length > 1) ? 1 : 0;
  const selectedCategory = contextualScores[categoryIndex].category;
  
  // Create truly random selections for visual elements
  const typeIndex = Math.floor(Math.random() * selectedCategory.specificTypes.length);
  const colorIndex = Math.floor(Math.random() * selectedCategory.colorSets.length);
  const elementIndex = Math.floor(Math.random() * selectedCategory.elementSets.length);
  const layoutIndex = Math.floor(Math.random() * selectedCategory.layouts.length);
  
  // Generate a meaningful title based on prompt and category
  const titleKeywords = prompt.split(' ')
    .filter(word => word.length > 3)
    .slice(0, 3)
    .join(' ');
  
  const categoryTitle = selectedCategory.category.charAt(0).toUpperCase() + selectedCategory.category.slice(1);
  const diagramTitle = `RiverMeadow ${categoryTitle}: ${titleKeywords}`;
  
  // Return enhanced diagram info with more unique properties
  return {
    category: selectedCategory.category,
    specificType: selectedCategory.specificTypes[typeIndex],
    colors: selectedCategory.colorSets[colorIndex],
    elements: [
      ...selectedCategory.elementSets[elementIndex],
      // Add contextual elements from knowledge base if available
      ...extractedTerms.slice(0, 3)
    ],
    layout: selectedCategory.layouts[layoutIndex],
    title: diagramTitle,
    uniqueId: uniqueId
  };
};

/**
 * Extract technical terms from knowledge base context for use in diagrams
 * Enhanced to detect patterns and create more unique diagrams based on context
 */
function extractTechnicalTerms(text: string): string[] {
  // Bail early if text is empty
  if (!text || text.trim() === '') {
    return ['cloud migration', 'virtual machine', 'network', 'server', 'infrastructure'];
  }
  
  // List of common technical terms related to cloud migration
  const technicalTerms = [
    'virtual machine', 'cloud', 'server', 'migration', 'container', 'kubernetes',
    'docker', 'load balancer', 'security group', 'subnet', 'vpc', 'instance', 
    'compute', 'storage', 'database', 'network', 'firewall', 'api', 'gateway',
    'serverless', 'function', 'lambda', 'microservice', 'architecture', 'workflow',
    'pipeline', 'cicd', 'devops', 'infrastructure', 'platform', 'saas', 'paas',
    'iaas', 'public cloud', 'private cloud', 'hybrid cloud', 'multi-cloud', 'azure',
    'aws', 'gcp', 'google cloud', 'amazon web services', 'microsoft azure',
    'virtualization', 'hypervisor', 'vmware', 'esxi', 'vcenter', 'hyper-v', 'kvm',
    'xen', 'openstack', 'terraform', 'cloudformation', 'arm template', 'ansible',
    'puppet', 'chef', 'salt', 'orchestration', 'automation', 'deployment', 'release',
    'artifact', 'backup', 'restore', 'disaster recovery', 'high availability',
    'scalability', 'elasticity', 'performance', 'monitoring', 'logging', 'analytics',
    'dashboard', 'alert', 'notification', 'sla', 'slo', 'sli', 'metrics', 'kpi',
    'compliance', 'governance', 'security', 'encryption', 'identity', 'access control',
    'authentication', 'authorization', 'iam', 'rbac', 'role', 'policy', 'permission',
    // Adding more specific RiverMeadow migration terms
    'source environment', 'target environment', 'transformation', 'assessment', 'discovery',
    'planning', 'deployment', 'cutover', 'testing', 'validation', 'optimization',
    'synchronization', 'replication', 'conversion', 'performance testing', 'security compliance',
    'licensing', 'cost optimization', 'TCO', 'ROI', 'business case', 'operational readiness',
    'application dependency', 'data transfer', 'bandwidth', 'latency', 'connectivity'
  ];
  
  // RiverMeadow specific terms
  const riverMeadowTerms = [
    'RiverMeadow CloudMigration', 'RiverMeadow Platform', 'SaaS Migration', 
    'RiverMeadow Migration Platform', 'RiverMeadow SaaS', 'RiverMeadow API',
    'OS-Based Migration', 'Physical to Virtual Migration', 'Cloud to Cloud Migration',
    'Migration Factory', 'Discovery API', 'Application Dependency Mapping',
    'Pre-Flight Checks', 'Migration Automation', 'Migration Assessment', 
    'Migration Planning', 'Migration Execution', 'Migration Validation',
    'Migration Wave Planning', 'Dependency Analysis', 'Automated Testing'
  ];
  
  // Extract terms found in the text
  const foundTerms: string[] = [];
  
  technicalTerms.forEach(term => {
    if (text.toLowerCase().includes(term.toLowerCase())) {
      foundTerms.push(term);
    }
  });
  
  // Extract RiverMeadow specific terms
  riverMeadowTerms.forEach(term => {
    if (text.toLowerCase().includes(term.toLowerCase())) {
      foundTerms.push(term);
    }
  });
  
  // Add RiverMeadow specific terms if RiverMeadow is mentioned but no specific terms found
  if ((text.toLowerCase().includes('rivermeadow') || text.toLowerCase().includes('river meadow')) && 
      !foundTerms.some(term => term.includes('RiverMeadow'))) {
    foundTerms.push('RiverMeadow CloudMigration', 'RiverMeadow Platform', 'SaaS Migration');
  }
  
  // Also extract any capitalized terms which are likely technical names/components
  const capitalizedTermsMatch = text.match(/[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*/g);
  const capitalizedTerms = capitalizedTermsMatch 
    ? Array.from(new Set(capitalizedTermsMatch.map(t => t)))
        .filter(term => 
          term.length > 3 && 
          !['The', 'This', 'That', 'Then', 'These', 'Those', 'They', 'NULL'].includes(term)
        )
    : [];
  
  // Generate some random compound terms for uniqueness
  const randomTerms: string[] = [];
  // Add timestamp to ensure uniqueness
  const timestamp = Date.now();
  
  // Create unique compound terms combining words that appear in the text
  const words = text.split(/\s+/).filter(w => w.length > 3);
  if (words.length >= 2) {
    // Take some random words from the text to create unique compounds
    const randomWord1 = words[Math.floor(Math.random() * words.length)];
    const randomWord2 = words[Math.floor(Math.random() * words.length)];
    randomTerms.push(`${randomWord1}-${randomWord2}-${timestamp % 1000}`);
  }
  
  // Always add at least one guaranteed unique term
  randomTerms.push(`migration-element-${timestamp % 10000}`);
  
  // Combine all terms and deduplicate
  const allTerms = [...foundTerms, ...capitalizedTerms, ...randomTerms];
  const uniqueTerms: string[] = [];
  
  for (const term of allTerms) {
    if (!uniqueTerms.includes(term)) {
      uniqueTerms.push(term);
    }
  }
  
  return uniqueTerms.length > 0 ? 
    uniqueTerms : 
    ['cloud migration', 'virtual machine', 'network', 'server', 'infrastructure'];
}

/**
 * Completely rewritten diagram generation function that incorporates context from Pinecone
 * and uses advanced techniques to ensure unique diagram generation each time
 */
export const generateDiagram = async (
  prompt: string,
  knowledgeContext: string[] = [],
  useDrawIO: boolean = true
): Promise<{
  imagePath: string;
  mmdPath: string;
  mmdFilename: string;
  altText: string;
}> => {
  try {
    // Make sure necessary directories exist
    await ensureDirectoriesExist();
    
    // Analyze input to extract meaning and prepare for diagram generation
    const reqTimestamp = Date.now();
    const reqUuid = uuidv4().substring(0, 8);
    
    // Extract key terms from the knowledge context to incorporate into the diagram
    console.log(`Processing diagram request with ${knowledgeContext.length} context snippets`);
    
    // Get enhanced diagram type information that includes context and randomization
    // Convert context to array format if needed
  const contextArray = Array.isArray(knowledgeContext) ? knowledgeContext : [knowledgeContext];
  const diagramInfo = categorizeDiagramType(prompt, contextArray);
    
    // Build a truly unique enhanced prompt using multiple factors:
    // 1. The original prompt
    // 2. Timestamp and session ID for uniqueness
    // 3. Specific request for visual variety
    // 4. Counter-measures against model tendency to create similar outputs
    const enhancedPrompt = `
Create a COMPLETELY UNIQUE and visually DISTINCT diagram for:
"${prompt}"

IMPORTANT REQUIREMENTS:
- Make this diagram VISUALLY DIFFERENT from any other diagram you've generated before
- Use ${diagramInfo.layout} layout style specifically
- Feature ${diagramInfo.elements.slice(0, 3).join(', ')} as key diagram components
- Ensure clarity, professionalism, and visual appeal
- Create unique identifier: ${diagramInfo.uniqueId}
`.trim();
    
    // Log comprehensive debug information
    console.log('\n==== ENHANCED DIAGRAM GENERATION REQUEST ====');
    console.log(`Original prompt: "${prompt}"`);
    console.log(`Diagram category: ${diagramInfo.category}`);
    console.log(`Diagram type: ${diagramInfo.specificType}`);
    console.log(`Diagram title: ${diagramInfo.title}`);
    console.log(`Colors: Primary=${diagramInfo.colors.primary}, Secondary=${diagramInfo.colors.secondary}, Accent=${diagramInfo.colors.accent}`);
    console.log(`Elements: ${diagramInfo.elements.join(', ')}`);
    console.log(`Layout: ${diagramInfo.layout}`);
    console.log(`Unique ID: ${diagramInfo.uniqueId}`);
    console.log(`Context terms: ${extractTechnicalTerms(knowledgeContext.join(' ')).slice(0, 10).join(', ') || 'None'}`);
    console.log('===============================================\n');
    
    // Try to use Draw.IO first if requested
    if (useDrawIO) {
      try {
        console.log('Generating Draw.IO diagram with categorized style');
        
        // Create a unique system prompt based on the diagram category
        let systemMessage = "";
        
        switch (diagramInfo.category) {
          case 'network':
            systemMessage = `You are an expert at creating network architecture diagrams using Draw.IO (diagrams.net). 
Generate a ${diagramInfo.specificType} diagram with a ${diagramInfo.layout} layout.
Use color scheme: primary=${diagramInfo.colors.primary}, secondary=${diagramInfo.colors.secondary}, accent=${diagramInfo.colors.accent}.
Include these elements: ${diagramInfo.elements.join(', ')}.
Generate ONLY valid XML for Draw.IO without any explanations or markdown formatting.`;
            break;
            
          case 'process':
            systemMessage = `You are an expert at creating flowchart diagrams using Draw.IO (diagrams.net).
Generate a ${diagramInfo.specificType} diagram with a ${diagramInfo.layout} layout.
Use color scheme: primary=${diagramInfo.colors.primary}, secondary=${diagramInfo.colors.secondary}, accent=${diagramInfo.colors.accent}.
Include these elements: ${diagramInfo.elements.join(', ')}.
Generate ONLY valid XML for Draw.IO without any explanations or markdown formatting.`;
            break;
            
          case 'software':
            systemMessage = `You are an expert at creating software architecture diagrams using Draw.IO (diagrams.net).
Generate a ${diagramInfo.specificType} diagram with a ${diagramInfo.layout} layout.
Use color scheme: primary=${diagramInfo.colors.primary}, secondary=${diagramInfo.colors.secondary}, accent=${diagramInfo.colors.accent}.
Include these elements: ${diagramInfo.elements.join(', ')}.
Generate ONLY valid XML for Draw.IO without any explanations or markdown formatting.`;
            break;
            
          case 'os-migration':
            systemMessage = `You are an expert at creating OS migration diagrams using Draw.IO (diagrams.net).
Generate a ${diagramInfo.specificType} diagram with a ${diagramInfo.layout} layout.
Use color scheme: primary=${diagramInfo.colors.primary}, secondary=${diagramInfo.colors.secondary}, accent=${diagramInfo.colors.accent}.
Include these elements: ${diagramInfo.elements.join(', ')}.
Generate ONLY valid XML for Draw.IO without any explanations or markdown formatting.`;
            break;
            
          default:
            systemMessage = `You are an expert at creating diagrams using Draw.IO (diagrams.net).
Generate a migration process diagram with a top-down layout.
Use consistent, professional colors and shapes.
Generate ONLY valid XML for Draw.IO without any explanations or markdown formatting.`;
        }
        
        // Create a detailed user prompt with specific styling requirements
        const userMessage = `Create a unique and visually distinct diagram in Draw.IO XML format for: ${enhancedPrompt}

Please follow these specific requirements:
1. Create a diagram with title "${diagramInfo.specificType} - RiverMeadow"
2. Use a ${diagramInfo.layout} layout structure
3. Use these exact color HEX values:
   - Primary elements: ${diagramInfo.colors.primary}
   - Secondary elements: ${diagramInfo.colors.secondary}
   - Accent elements: ${diagramInfo.colors.accent}
4. Include these specific elements: ${diagramInfo.elements.join(', ')}
5. Use appropriate icons, shapes, and styles for a professional appearance
6. Include clear labels for all components
7. Use different shapes for different types of elements
8. Add a title and brief legend
9. Diagram ID must be set to "${diagramInfo.uniqueId}"

IMPORTANT: Return ONLY the raw Draw.IO XML without any explanation, markdown formatting, or code blocks`;
        
        // Log the entire request to help debug
        console.log('\n\n==== DIAGRAM GENERATION REQUEST ====');
        console.log('System Message:');
        console.log(systemMessage);
        console.log('\nUser Message:');
        console.log(userMessage);
        console.log('Temperature: 0.8, Model: gpt-4o');
        console.log('==============================\n\n');
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          max_tokens: 4000,
          temperature: 1.0,  // Maximum temperature for highest variation
        });
        
        // Log response
        console.log('\n\n==== DIAGRAM GENERATION RESPONSE (TRUNCATED) ====');
        const responseContent = response.choices[0].message.content || "";
        console.log(responseContent.substring(0, 200) + '...[TRUNCATED]');
        console.log('==============================\n\n');
        
        // Extract the Draw.IO XML from the response
        const drawioXml = responseContent.trim() || "";
        
        // Clean up XML - remove markdown code blocks if present
        const cleanXml = drawioXml
          .replace(/```xml/g, '')
          .replace(/```drawio/g, '')
          .replace(/```/g, '')
          .trim();
        
        // Create unique filenames with new timestamp to ensure uniqueness
        const fileTimestamp = Date.now();
        const fileUuid = uuidv4().substring(0, 8);
        const xmlFilename = `diagram_${fileTimestamp}_${fileUuid}.drawio`;
        const htmlFilename = `diagram_${fileTimestamp}_${fileUuid}.html`;
        
        // Set file paths
        const xmlPath = path.join(GENERATED_IMAGES_DIR, xmlFilename);
        const htmlPath = path.join(GENERATED_IMAGES_DIR, htmlFilename);
        
        // Save the Draw.IO XML to a file
        await writeFile(xmlPath, cleanXml);
        
        // Create HTML for the Draw.IO diagram using string concatenation
        // Get a more specific title based on diagram category
        let titleText = '';
        switch (diagramInfo.category) {
          case 'network':
            titleText = `RiverMeadow ${diagramInfo.specificType}`;
            break;
          case 'process':
            titleText = `RiverMeadow ${diagramInfo.specificType}`;
            break;
          case 'software':
            titleText = `RiverMeadow ${diagramInfo.specificType}`;
            break;
          case 'os-migration':
            titleText = `RiverMeadow ${diagramInfo.specificType}`;
            break;
          default:
            titleText = 'RiverMeadow Migration Diagram';
        }
        let drawioHtml = "<!DOCTYPE html>";
        drawioHtml += "<html lang=\"en\">";
        drawioHtml += "<head>";
        drawioHtml += "  <meta charset=\"UTF-8\">";
        drawioHtml += "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">";
        drawioHtml += "  <title>RiverMeadow Diagram</title>";
        drawioHtml += "  <style>";
        drawioHtml += "    body, html { height: 100%; margin: 0; padding: 0; overflow: auto; font-family: Arial, sans-serif; }";
        drawioHtml += "    .diagram-container { display: flex; flex-direction: column; height: 100vh; }";
        drawioHtml += "    .header { background: white; padding: 10px 20px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; z-index: 10; }";
        drawioHtml += "    h1 { color: #0078d4; margin: 0; font-size: 18px; }";
        drawioHtml += "    .content-area { flex: 1; padding: 20px; overflow: auto; background: white; display: flex; flex-direction: column; align-items: center; position: relative; }";
        drawioHtml += "    #svg-container { max-width: 100%; transition: transform 0.3s; transform-origin: center top; margin: 0 auto; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 4px; padding: 16px; position: relative; cursor: grab; pointer-events: all; }";
        drawioHtml += "    #svg-container:active { cursor: grabbing; }"; 
        drawioHtml += "    #svg-container svg { pointer-events: none; width: 100%; height: 100%; }";
        drawioHtml += "    #svg-container svg * { pointer-events: none; }";
        drawioHtml += "    svg { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }";
        drawioHtml += "    .actions { display: flex; gap: 10px; }";
        drawioHtml += "    .button { background-color: #0078d4; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; }";
        drawioHtml += "    .button:hover { background-color: #005a9e; }";
        drawioHtml += "    .button-download { background-color: #28a745; }";
        drawioHtml += "    .button-download:hover { background-color: #218838; }";
        drawioHtml += "    .loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #666; background: rgba(255,255,255,0.9); padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; }";
        drawioHtml += "    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #0078d4; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 15px; }";
        drawioHtml += "    .hidden { display: none; }";
        drawioHtml += "    .zoom-controls { position: fixed; bottom: 20px; right: 20px; background: white; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); display: flex; overflow: hidden; z-index: 100; }";
        drawioHtml += "    .zoom-button { background: none; border: none; border-right: 1px solid #eee; padding: 8px 12px; cursor: pointer; font-size: 14px; }";
        drawioHtml += "    .zoom-button:last-child { border-right: none; }";
        drawioHtml += "    .zoom-button:hover { background: #f5f5f5; }";
        drawioHtml += "    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }";
        drawioHtml += "  </style>";
        drawioHtml += "</head>";
        drawioHtml += "<body>";
        drawioHtml += "  <div class=\"diagram-container\">";
        drawioHtml += "    <div class=\"header\">";
        drawioHtml += "      <h1>" + titleText + "</h1>";
        drawioHtml += "      <div class=\"actions\">";
        const baseFileName = xmlFilename.replace(/\.(xml|drawio)$/, '');
        drawioHtml += "        <a href=\"/api/download-full-diagram/" + baseFileName + "\" download=\"rivermeadow_diagram.png\" class=\"button button-download\">Download PNG</a>";
        drawioHtml += "        <a href=\"/api/diagram-xml/" + xmlFilename + "\" download=\"rivermeadow_diagram.drawio\" class=\"button\">Download Source</a>";
        drawioHtml += "      </div>";
        drawioHtml += "    </div>";
        drawioHtml += "    <div class=\"content-area\">";
        drawioHtml += "      <div id=\"loading\" class=\"loading\">";
        drawioHtml += "        <div class=\"spinner\"></div>";
        drawioHtml += "        <div>Loading diagram...</div>";
        drawioHtml += "      </div>";
        drawioHtml += "      <div id=\"svg-container\"></div>";
        drawioHtml += "    </div>";
        drawioHtml += "    <div class=\"zoom-controls\">";
        drawioHtml += "      <button class=\"zoom-button\" id=\"zoom-out\">−</button>";
        drawioHtml += "      <button class=\"zoom-button\" id=\"zoom-reset\">100%</button>";
        drawioHtml += "      <button class=\"zoom-button\" id=\"zoom-in\">+</button>";
        drawioHtml += "    </div>";
        drawioHtml += "  </div>";
        drawioHtml += "  <script>";
        drawioHtml += "    const svgContainer = document.getElementById('svg-container');";
        drawioHtml += "    const loading = document.getElementById('loading');";
        drawioHtml += "    const zoomResetButton = document.getElementById('zoom-reset');";
        drawioHtml += "    let currentZoom = 0.5;";
        drawioHtml += "    try {";
        drawioHtml += "      const savedZoom = localStorage.getItem('diagram_zoom_level');";
        drawioHtml += "      if (savedZoom && !isNaN(parseFloat(savedZoom))) {";
        drawioHtml += "        currentZoom = parseFloat(savedZoom);";
        drawioHtml += "      }";
        drawioHtml += "    } catch (e) {}";
        drawioHtml += "    if (zoomResetButton) {";
        drawioHtml += "      zoomResetButton.textContent = Math.round(currentZoom * 100) + '%';";
        drawioHtml += "    }";
        drawioHtml += "    fetch('/api/diagram-svg/" + xmlFilename + "')";
        drawioHtml += "      .then(response => {";
        drawioHtml += "        if (!response.ok) throw new Error('Failed to load diagram');";
        drawioHtml += "        return response.text();";
        drawioHtml += "      })";
        drawioHtml += "      .then(svgText => {";
        drawioHtml += "        svgContainer.innerHTML = svgText;";
        drawioHtml += "        loading.classList.add('hidden');";
        drawioHtml += "        const svg = svgContainer.querySelector('svg');";
        drawioHtml += "        if (svg) {";
        drawioHtml += "          svg.style.maxWidth = '100%';";
        drawioHtml += "          svg.style.height = 'auto';";
        drawioHtml += "          svg.style.transformOrigin = 'center';";
        drawioHtml += "        }";
        drawioHtml += "        applyZoom();";
        drawioHtml += "      })";
        drawioHtml += "      .catch(error => {";
        drawioHtml += "        console.error('Error loading SVG:', error);";
        drawioHtml += "        loading.innerHTML = '<div style=\"color:red\">Error loading diagram</div>';";
        drawioHtml += "      });";
        drawioHtml += "    document.getElementById('zoom-in').addEventListener('click', () => {";
        drawioHtml += "      currentZoom = Math.min(2.5, currentZoom + 0.1);";
        drawioHtml += "      applyZoom();";
        drawioHtml += "    });";
        drawioHtml += "    document.getElementById('zoom-out').addEventListener('click', () => {";
        drawioHtml += "      currentZoom = Math.max(0.2, currentZoom - 0.1);";
        drawioHtml += "      applyZoom();";
        drawioHtml += "    });";
        drawioHtml += "    document.getElementById('zoom-reset').addEventListener('click', () => {";
        drawioHtml += "      currentZoom = 1.0;";
        drawioHtml += "      applyZoom();";
        drawioHtml += "    });";
        drawioHtml += "    // Initialize drag functionality";
        drawioHtml += "    let isDragging = false;";
        drawioHtml += "    let startX, startY, initialOffsetX = 0, initialOffsetY = 0;";
        drawioHtml += "    ";
        drawioHtml += "    if (svgContainer) {";
        drawioHtml += "      svgContainer.addEventListener('mousedown', (e) => {";
        drawioHtml += "        // Only start dragging on primary button (usually left button)";
        drawioHtml += "        if (e.button === 0) {";
        drawioHtml += "          isDragging = true;";
        drawioHtml += "          startX = e.clientX;";
        drawioHtml += "          startY = e.clientY;";
        drawioHtml += "          // Extract current transform values";
        drawioHtml += "          const style = window.getComputedStyle(svgContainer);";
        drawioHtml += "          const transform = style.transform || 'translate(0px, 0px) scale(1)';";
        drawioHtml += "          const translateMatch = transform.match(/translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\)/);";
        drawioHtml += "          if (translateMatch) {";
        drawioHtml += "            initialOffsetX = parseFloat(translateMatch[1]) || 0;";
        drawioHtml += "            initialOffsetY = parseFloat(translateMatch[2]) || 0;";
        drawioHtml += "          } else {";
        drawioHtml += "            initialOffsetX = 0;";
        drawioHtml += "            initialOffsetY = 0;";
        drawioHtml += "          }";
        drawioHtml += "          e.preventDefault();";
        drawioHtml += "        }";
        drawioHtml += "      });";
        drawioHtml += "    }";
        drawioHtml += "    ";
        drawioHtml += "    document.addEventListener('mousemove', (e) => {";
        drawioHtml += "      if (isDragging) {";
        drawioHtml += "        const dx = e.clientX - startX;";
        drawioHtml += "        const dy = e.clientY - startY;";
        drawioHtml += "        const newX = initialOffsetX + dx;";
        drawioHtml += "        const newY = initialOffsetY + dy;";
        drawioHtml += "        svgContainer.style.transform = 'translate(' + newX + 'px, ' + newY + 'px) scale(' + currentZoom + ')';";
        drawioHtml += "      }";
        drawioHtml += "    });";
        drawioHtml += "    ";
        drawioHtml += "    document.addEventListener('mouseup', () => {";
        drawioHtml += "      isDragging = false;";
        drawioHtml += "    });";
        drawioHtml += "    ";
        drawioHtml += "    document.addEventListener('mouseleave', () => {";
        drawioHtml += "      isDragging = false;";
        drawioHtml += "    });";
        drawioHtml += "    ";
        drawioHtml += "    function applyZoom() {";
        drawioHtml += "      if (svgContainer) {";
        drawioHtml += "        // Keep the transform position when changing zoom";
        drawioHtml += "        const style = window.getComputedStyle(svgContainer);";
        drawioHtml += "        const transform = style.transform || 'translate(0px, 0px) scale(1)';";
        drawioHtml += "        const translateMatch = transform.match(/translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\)/);";
        drawioHtml += "        const translateX = translateMatch ? parseFloat(translateMatch[1]) : 0;";
        drawioHtml += "        const translateY = translateMatch ? parseFloat(translateMatch[2]) : 0;";
        drawioHtml += "        ";
        drawioHtml += "        svgContainer.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + currentZoom + ')';";
        drawioHtml += "        const resetButton = document.getElementById('zoom-reset');";
        drawioHtml += "        if (resetButton) {";
        drawioHtml += "          resetButton.textContent = Math.round(currentZoom * 100) + '%';";
        drawioHtml += "        }";
        drawioHtml += "        try {";
        drawioHtml += "          localStorage.setItem('diagram_zoom_level', currentZoom.toString());";
        drawioHtml += "        } catch (e) {}";
        drawioHtml += "      }";
        drawioHtml += "    }";
        drawioHtml += "  </script>";
        drawioHtml += "</body>";
        drawioHtml += "</html>";

        // Save the HTML file
        await writeFile(htmlPath, drawioHtml);
        
        console.log(`Successfully generated Draw.IO diagram: ${xmlFilename} and HTML viewer: ${htmlFilename}`);
        
        // Return the paths
        return {
          imagePath: `/uploads/generated/${htmlFilename}`,
          mmdPath: `/uploads/generated/${xmlFilename}`,
          mmdFilename: xmlFilename,
          altText: prompt.substring(0, 255)
        };
      } catch (error) {
        console.error('Error generating Draw.IO diagram:', error);
        console.log('Falling back to mermaid diagram generation due to error');
        // Fall through to mermaid generation as a fallback
      }
    }
    
    // If we're here, use Mermaid for diagram generation
    console.log('Using Mermaid for diagram generation');
    let mermaidPrompt;
    
    // Choose the appropriate mermaid diagram type based on the diagram category
    if (diagramInfo.category === 'network') {
      mermaidPrompt = "Create a mermaid.js network diagram code for: " + enhancedPrompt + "\n" +
      "Use the appropriate syntax for network diagrams. In Mermaid, you can represent networks using:\n" +
      "1. flowchart LR - for left-to-right network diagrams\n" +
      "2. Use different node shapes to represent network components:\n" +
      "   - ((Database)) for databases\n" +
      "   - [Server] for servers\n" +
      "   - {{Firewall}} for firewalls\n" +
      "   - (Router) for routers\n" +
      "   - [/Load Balancer/] for load balancers\n" +
      "   - [(Storage)] for storage\n" +
      "   - [Cloud] for cloud services\n\n" +
      "3. Use these specific colors for styling: " + 
         diagramInfo.colors.primary + ", " + 
         diagramInfo.colors.secondary + ", " + 
         diagramInfo.colors.accent + "\n" +
      "4. Include these elements: " + diagramInfo.elements.join(', ') + "\n" +
      "5. Create a title: RiverMeadow " + diagramInfo.specificType + "\n\n" +
      "Only generate valid mermaid.js code wrapped in a code block, nothing else. Use proper RiverMeadow terminology.";
    } else if (diagramInfo.category === 'os-migration') {
      mermaidPrompt = "Create a mermaid.js OS migration diagram code for: " + enhancedPrompt + "\n" +
      "The diagram should be a flowchart (use flowchart " + 
      (diagramInfo.layout.includes('left') ? 'LR' : 'TD') + " syntax). " +
      "Show the process of migrating from one OS to another with RiverMeadow software.\n" +
      "1. Use different node shapes for different steps in the migration process\n" +
      "2. Use these specific colors for styling: " + 
         diagramInfo.colors.primary + ", " + 
         diagramInfo.colors.secondary + ", " + 
         diagramInfo.colors.accent + "\n" +
      "3. Include these elements: " + diagramInfo.elements.join(', ') + "\n" +
      "4. Create a title: RiverMeadow " + diagramInfo.specificType + "\n\n" +
      "Only generate valid mermaid.js code wrapped in a code block, nothing else. Make it VISUALLY UNIQUE.";
    } else if (diagramInfo.category === 'software') {
      mermaidPrompt = "Create a mermaid.js software architecture diagram code for: " + enhancedPrompt + "\n" +
      "The diagram should be a flowchart (use flowchart " + 
      (diagramInfo.layout.includes('left') ? 'LR' : 'TD') + " syntax). " +
      "Show the software components and their relationships in RiverMeadow's platform.\n" +
      "1. Use different node shapes for different types of software components\n" +
      "2. Use these specific colors for styling: " + 
         diagramInfo.colors.primary + ", " + 
         diagramInfo.colors.secondary + ", " + 
         diagramInfo.colors.accent + "\n" +
      "3. Include these elements: " + diagramInfo.elements.join(', ') + "\n" +
      "4. Create a title: RiverMeadow " + diagramInfo.specificType + "\n\n" +
      "Only generate valid mermaid.js code wrapped in a code block, nothing else. Make it VISUALLY UNIQUE.";
    } else {
      // Default to process diagram
      mermaidPrompt = "Create a mermaid.js process diagram code for: " + enhancedPrompt + "\n" +
      "The diagram should be a flowchart (use flowchart TD syntax). Keep it simple and focused on the main steps.\n" +
      "1. Show the main 5-7 steps in the RiverMeadow migration process\n" +
      "2. Use these specific colors for styling: " + 
         diagramInfo.colors.primary + ", " + 
         diagramInfo.colors.secondary + ", " + 
         diagramInfo.colors.accent + "\n" +
      "3. Include these elements: " + diagramInfo.elements.join(', ') + "\n" +
      "4. Create a title: RiverMeadow " + diagramInfo.specificType + "\n\n" +
      "Only generate valid mermaid.js code wrapped in a code block, nothing else. Make it VISUALLY UNIQUE.";
    }

    const diagramResponse = await openai.chat.completions.create({
      model: "gpt-4o", // Use gpt-4o instead of DALL-E
      messages: [
        {role: "system", content: "You are a diagram creation assistant that generates only mermaid.js code. Respond with valid mermaid.js code only, no explanations."},
        {role: "user", content: mermaidPrompt}
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });
    
    // Extract and validate the diagram response
    const messageContent = diagramResponse.choices[0].message.content || "";
    
    // Add uniqueness factors
    const timestamp = Date.now();
    const uniqueId = `${timestamp}-${Math.random().toString(36).substring(2)}`;
    
    // Incorporate context and uniqueness into prompt
    const enhancedPrompt = `
      Create a UNIQUE diagram specifically for this request:
      ${prompt}
      
      Requirements:
      - Use unique identifier: ${uniqueId}
      - Make this visually distinct
      - Create clear professional layout
      - Include RiverMeadow specific terminology
      `;
      
    // Process the response
    if (!messageContent.includes('```mermaid')) {
      console.error('Invalid diagram response received');
      throw new Error('Failed to generate valid diagram');
    }
    
    // Extract and clean the mermaid code
    let cleanMermaidCode = messageContent
      .replace(/```mermaid/g, '')
      .replace(/```/g, '')
      .trim();
    
    // Check for minimum valid mermaid code length
    if (cleanMermaidCode.length < 10) {
      console.log('Generated mermaid code too short, using fallback diagram');
      
      // Create a fallback diagram based on the diagram category
      if (diagramInfo.category === 'network') {
        // Network diagram fallback
        cleanMermaidCode = `flowchart LR
    Internet((Internet)) --> FW{{Firewall}}
    FW --> LB[/Load Balancer/]
    LB --> S1[Source Server 1]
    LB --> S2[Source Server 2]
    S1 --> RMS[RiverMeadow Server]
    S2 --> RMS
    RMS --> DB[(Database)]
    RMS --> Cloud1[Cloud Provider 1]
    RMS --> Cloud2[Cloud Provider 2]
    
    classDef network fill:${diagramInfo.colors.primary},stroke:#2196f3,stroke-width:1px;
    classDef source fill:${diagramInfo.colors.secondary},stroke:#43a047,stroke-width:1px;
    classDef target fill:${diagramInfo.colors.accent},stroke:#ff9800,stroke-width:1px;
    
    class Internet,FW,LB network
    class S1,S2 source
    class Cloud1,Cloud2 target`;
      } else if (diagramInfo.category === 'os-migration') {
        // OS Migration fallback
        cleanMermaidCode = `flowchart ${diagramInfo.layout.includes('left') ? 'LR' : 'TD'}
    Start([Start]) --> Assessment[Source OS Assessment]
    Assessment --> Compatibility{Compatibility Check}
    Compatibility -->|Compatible| Backup[Backup Source System]
    Compatibility -->|Incompatible| Remediation[Application Remediation]
    Remediation --> Backup
    Backup --> Migration[OS Migration Process]
    Migration --> Testing[Application Testing]
    Testing --> Validation{Validation}
    Validation -->|Pass| Cutover[Production Cutover]
    Validation -->|Fail| Rollback[Rollback to Source]
    Rollback --> Assessment
    Cutover --> End([Migration Complete])
    
    classDef start fill:${diagramInfo.colors.primary},stroke:#333,color:white;
    classDef process fill:${diagramInfo.colors.secondary},stroke:#333;
    classDef decision fill:${diagramInfo.colors.accent},stroke:#333;
    
    class Start,End start
    class Assessment,Backup,Migration,Testing,Cutover,Rollback,Remediation process
    class Compatibility,Validation decision`;
      } else if (diagramInfo.category === 'software') {
        // Software architecture fallback
        cleanMermaidCode = `flowchart ${diagramInfo.layout.includes('left') ? 'LR' : 'TD'}
    UI[User Interface] --> API[RiverMeadow API]
    API --> Auth[(Authentication)]
    API --> Core{Core Migration Engine}
    Core --> SourceAdapter[Source Adapter]
    Core --> TargetAdapter[Target Adapter]
    SourceAdapter --> SourceSystems[(Source Systems)]
    TargetAdapter --> TargetSystems[(Target Systems)]
    Core --> Storage[(Migration Storage)]
    Core --> Jobs[Job Manager]
    Jobs --> Worker1[Worker 1]
    Jobs --> Worker2[Worker 2]
    
    classDef frontend fill:${diagramInfo.colors.primary},stroke:#333;
    classDef backend fill:${diagramInfo.colors.secondary},stroke:#333;
    classDef data fill:${diagramInfo.colors.accent},stroke:#333;
    
    class UI frontend
    class API,Core,SourceAdapter,TargetAdapter,Jobs,Worker1,Worker2 backend
    class Auth,Storage,SourceSystems,TargetSystems data`;
      } else {
        // Process diagram fallback
        cleanMermaidCode = `flowchart TD
    A([RiverMeadow Migration Start]) --> B[Deploy Migration Appliance]
    B --> C[Configure Source and Target]
    C --> D{Perform Preflight Checks}
    D -->|Pass| E[Execute Migration]
    D -->|Fail| C
    E --> F[Verify Results]
    F --> G([Migration Complete])
    
    classDef start fill:${diagramInfo.colors.primary},stroke:#333,color:white;
    classDef process fill:${diagramInfo.colors.secondary},stroke:#333;
    classDef decision fill:${diagramInfo.colors.accent},stroke:#333;
    
    class A,G start
    class B,C,E,F process
    class D decision`;
      }
    }
    
    // Create an HTML file with the mermaid diagram using string concatenation
    // Get a more specific title based on diagram category
    let diagramTitle = `RiverMeadow ${diagramInfo.specificType}`;
    const htmlContent = '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>RiverMeadow Diagram</title>' +
'  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>' +
'  <script>' +
'    mermaid.initialize({' +
'      startOnLoad: true,' +
'      theme: "neutral",' +
'      flowchart: { ' +
'        useMaxWidth: false,' +
'        htmlLabels: true,' +
'        curve: "basis" ' +
'      },' +
'      securityLevel: "loose",' +
'      fontFamily: "Arial, sans-serif",' +
'      themeVariables: {' +
'        fontFamily: "Arial, sans-serif",' +
'        primaryTextColor: "#333333",' +
'        primaryColor: "#2196f3",' +
'        primaryBorderColor: "#2196f3",' +
'        lineColor: "#333333",' +
'        fontSize: "16px"' +
'      }' +
'    });' +
'    ' +
'    window.addEventListener("load", function() {' +
'      if (window.parent) {' +
'        window.parent.postMessage("diagramLoaded", "*");' +
'      }' +
'    });' +
'    ' +
'    window.addEventListener("message", function(event) {' +
'      if (event.data && typeof event.data === "object") {' +
'        if (event.data.action === "zoom") {' +
'          const diagram = document.querySelector(".diagram-container");' +
'          if (diagram) {' +
'            const mermaidDiv = document.querySelector(".mermaid svg");' +
'            if (mermaidDiv) {' +
'              mermaidDiv.style.transform = "scale(" + event.data.scale + ")";' +
'              mermaidDiv.style.transformOrigin = "50% 0";' +
'              mermaidDiv.style.transition = "transform 0.2s ease";' +
'            }' +
'          }' +
'        }' +
'        if (event.data.action === "forceRedraw") {' +
'          console.log("Forcing diagram redraw...");' +
'          try {' +
'            const mermaidElement = document.querySelector(".mermaid");' +
'            if (mermaidElement) {' +
'              const code = mermaidElement.textContent || "";' +
'              mermaidElement.innerHTML = "";' +
'              setTimeout(function() {' +
'                mermaidElement.textContent = code;' +
'                mermaid.init(undefined, document.querySelectorAll(".mermaid"));' +
'              }, 50);' +
'            }' +
'          } catch (e) {' +
'            console.error("Error redrawing diagram:", e);' +
'          }' +
'        }' +
'      }' +
'    });' +
'  </script>' +
'  <style>' +
'    body {' +
'      font-family: Arial, sans-serif;' +
'      margin: 0;' +
'      padding: 20px;' +
'      background: #f5f5f5;' +
'    }' +
'    .diagram-container {' +
'      background: white;' +
'      padding: 20px;' +
'      border-radius: 8px;' +
'      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);' +
'      max-width: 2400px;' +
'      width: 100%;' +
'      margin: 0 auto;' +
'      overflow: visible;' +
'      position: relative;' +
'      cursor: grab;' +
'    }' +
'    .diagram-container:active {' +
'      cursor: grabbing;' +
'    }' +
'    .mermaid {' +
'      text-align: center;' +
'      width: 100%;' +
'      overflow: visible;' +
'      min-height: 500px;' +
'    }' +
'    .mermaid svg {' +
'      max-width: 100%;' +
'      width: auto !important;' +
'      height: auto !important;' +
'      font-family: Arial, sans-serif !important;' +
'      display: block;' +
'      margin: 0 auto;' +
'    }' +
'    .mermaid svg text, .mermaid svg tspan {' +
'      font-family: Arial, sans-serif !important;' +
'      font-weight: normal;' +
'    }' +
'    h1 {' +
'      text-align: center;' +
'      color: #0078d4;' +
'      margin-bottom: 20px;' +
'    }' +
'    pre.code-fallback {' +
'      white-space: pre-wrap;' +
'      font-size: 12px;' +
'      padding: 10px;' +
'      background: #f5f5f5;' +
'      border-radius: 4px;' +
'      margin-top: 20px;' +
'      overflow: auto;' +
'      max-height: 300px;' +
'      display: none;' +
'    }' +
'    .error-message {' +
'      color: #d32f2f;' +
'      padding: 15px;' +
'      text-align: center;' +
'      font-weight: bold;' +
'      display: none;' +
'    }' +
'    @media print {' +
'      body {' +
'        background: white;' +
'        padding: 0;' +
'        margin: 0;' +
'      }' +
'      .diagram-container {' +
'        box-shadow: none;' +
'        width: 100%;' +
'        padding: 0;' +
'        margin: 0;' +
'      }' +
'      .action-buttons {' +
'        display: none !important;' +
'      }' +
'      .mermaid svg {' +
'        max-width: 100% !important;' +
'        width: 100% !important;' +
'        height: auto !important;' +
'        page-break-inside: avoid;' +
'      }' +
'    }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="diagram-container">' +
'    <h1>' + diagramTitle + '</h1>' +
'    <div class="mermaid">' +
cleanMermaidCode +
'    </div>' +
'    <div class="error-message">Failed to render diagram</div>' +
'    <pre class="code-fallback">' + cleanMermaidCode + '</pre>' +
'  </div>' +
'  <script>' +
'    mermaid.parseError = function(err, hash) {' +
'      console.error("Mermaid error:", err);' +
'      document.querySelector(".error-message").style.display = "block";' +
'      document.querySelector(".code-fallback").style.display = "block";' +
'    };' +
'    ' +
'    document.addEventListener("DOMContentLoaded", function() {' +
'      setTimeout(function() {' +
'        try {' +
'          console.log("Initializing mermaid diagram...");' +
'          mermaid.init(undefined, document.querySelectorAll(".mermaid"));' +
'        } catch (e) {' +
'          console.error("Error initializing mermaid:", e);' +
'        }' +
'      }, 1000);' +
'    });' +
'    ' +
'    // Initialize drag functionality' +
'    let isDragging = false;' +
'    let startX, startY, initialOffsetX = 0, initialOffsetY = 0;' +
'    const container = document.querySelector(".diagram-container");' +
'    ' +
'    if (container) {' +
'      container.addEventListener("mousedown", function(e) {' +
'        if (e.button === 0) {' +
'          isDragging = true;' +
'          startX = e.clientX;' +
'          startY = e.clientY;' +
'          const style = window.getComputedStyle(container);' +
'          const transform = style.transform || "translate(0px, 0px)";' +
'          const translateMatch = transform.match(/translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\)/);' +
'          if (translateMatch) {' +
'            initialOffsetX = parseFloat(translateMatch[1]) || 0;' +
'            initialOffsetY = parseFloat(translateMatch[2]) || 0;' +
'          } else {' +
'            initialOffsetX = 0;' +
'            initialOffsetY = 0;' +
'          }' +
'          e.preventDefault();' +
'        }' +
'      });' +
'    }' +
'    ' +
'    document.addEventListener("mousemove", function(e) {' +
'      if (isDragging && container) {' +
'        const dx = e.clientX - startX;' +
'        const dy = e.clientY - startY;' +
'        const newX = initialOffsetX + dx;' +
'        const newY = initialOffsetY + dy;' +
'        container.style.transform = "translate(" + newX + "px, " + newY + "px)";' +
'      }' +
'    });' +
'    ' +
'    document.addEventListener("mouseup", function() {' +
'      isDragging = false;' +
'    });' +
'    ' +
'    document.addEventListener("mouseleave", function() {' +
'      isDragging = false;' +
'    });' +
'  </script>' +
'</body>' +
'</html>';

    // Create timestamp & unique filename with a common base
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    const baseFilename = `generated_diagram_${timestamp}_${uuid}`;
    const htmlFilename = `${baseFilename}.html`;
    const mmdFilename = `${baseFilename}.mmd`;
    
    const htmlPath = path.join(GENERATED_IMAGES_DIR, htmlFilename);
    const mmdPath = path.join(GENERATED_IMAGES_DIR, mmdFilename);
    
    // Save HTML file to disk
    await writeFile(htmlPath, htmlContent);
    
    // Save mermaid code to a separate .mmd file for mmdc conversion
    await writeFile(mmdPath, cleanMermaidCode);
    
    console.log(`Successfully generated and saved diagram: ${htmlFilename} and ${mmdFilename}`);
    
    return {
      imagePath: `/uploads/generated/${htmlFilename}`,
      mmdPath: `/uploads/generated/${mmdFilename}`,
      mmdFilename,
      altText: prompt.substring(0, 255) // Limit alt text length
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error('Error generating diagram:', error);
    throw new Error(`Failed to generate diagram: ${error.message}`);
  }
};

/**
 * Detect if the user is requesting a network/hardware diagram specifically
 * This is important for applying the right styling and icons in the diagram
 */
function detectNetworkDiagramRequest(prompt: string): boolean {
  // Convert to lowercase for case-insensitive matching
  const lowercasePrompt = prompt.toLowerCase();
  
  // Keywords that indicate a network/hardware/infrastructure diagram request
  const networkKeywords = [
    // Network specific
    'network diagram',
    'network architecture',
    'network topology',
    'system architecture',
    'infrastructure diagram',
    'cloud architecture',
    'cloud infrastructure',
    'connectivity diagram',
    'network design',
    'infrastructure architecture',
    'deployment architecture',
    'communication architecture',
    'system topology',
    
    // Hardware specific
    'hardware diagram',
    'physical architecture',
    'server layout',
    'data center',
    'rack layout',
    'hardware components',
    'device connectivity',
    
    // Technical infrastructure
    'technical architecture',
    'it infrastructure',
    'enterprise architecture',
    'technology stack',
    'hosting environment',
    'virtualization diagram'
  ];
  
  // Check if any network/hardware keywords are in the prompt
  const hasNetworkHardwareKeyword = networkKeywords.some(keyword => 
    lowercasePrompt.includes(keyword)
  );
  
  // Additional check for common network/hardware-related terms combined with diagram requests
  const hasNetworkHardwareContext = 
    (lowercasePrompt.includes('network') || 
     lowercasePrompt.includes('infrastructure') || 
     lowercasePrompt.includes('cloud') || 
     lowercasePrompt.includes('server') || 
     lowercasePrompt.includes('router') || 
     lowercasePrompt.includes('firewall') ||
     lowercasePrompt.includes('vpn') ||
     lowercasePrompt.includes('aws') ||
     lowercasePrompt.includes('azure') ||
     lowercasePrompt.includes('gcp') ||
     lowercasePrompt.includes('data center') ||
     lowercasePrompt.includes('hardware') ||
     lowercasePrompt.includes('physical') ||
     lowercasePrompt.includes('virtual machine') ||
     lowercasePrompt.includes('vm') ||
     lowercasePrompt.includes('database') ||
     lowercasePrompt.includes('storage') ||
     lowercasePrompt.includes('equipment') ||
     lowercasePrompt.includes('compute') ||
     lowercasePrompt.includes('device')) && 
    (lowercasePrompt.includes('diagram') || 
     lowercasePrompt.includes('map') || 
     lowercasePrompt.includes('topology') ||
     lowercasePrompt.includes('layout') ||
     lowercasePrompt.includes('infrastructure') ||
     lowercasePrompt.includes('architecture') ||
     lowercasePrompt.includes('visual') ||
     lowercasePrompt.includes('illustration'));
  
  if (hasNetworkHardwareKeyword || hasNetworkHardwareContext) {
    console.log('Network/hardware diagram request detected');
    return true;
  }
  
  return false;
}

/**
 * Check if a prompt is asking for an image or diagram
 */
export const isImageGenerationRequest = (prompt: string): boolean => {
  // Convert to lowercase for case-insensitive matching
  const lowercasePrompt = prompt.toLowerCase();
  
  // First, check if this is a question - if it starts with what, how, why, when, etc.
  // If so, we DON'T want to generate a diagram for it unless it explicitly asks
  const isQuestion = /^(?:what|how|why|when|where|who|can|is|are|do|does|which|could|would|should|will)\b/i.test(lowercasePrompt);
  
  // ONLY if this is a question, let's check if it EXPLICITLY asks for a visual
  if (isQuestion) {
    // If it's a question, it should explicitly ask for a visual
    const explicitlyAsksForVisual = 
      /(?:show|create|draw|generate|make|give|visualize|illustrate|display)\s+(?:me|us|a|an)?\s*(?:diagram|chart|visual|graph|picture|image|illustration|visualization|flow)/i.test(lowercasePrompt) ||
      /(?:can|could)\s+(?:you|i)\s+(?:show|see|have|get|create|make|draw)\s+(?:a|an)?\s*(?:diagram|visual|chart|graph|picture|image|illustration|visualization)/i.test(lowercasePrompt) ||
      /(?:i|we)\s+(?:want|need|would like)\s+(?:a|an|to see)?\s*(?:diagram|chart|visual|graph|picture|image|illustration|visualization)/i.test(lowercasePrompt) ||
      /(?:explain|describe|show)\s+(?:visually|with\s+a\s+diagram|with\s+an\s+image|with\s+a\s+picture|with\s+a\s+visual)/i.test(lowercasePrompt);
      
    if (!explicitlyAsksForVisual) {
      console.log('Question detected but does not explicitly ask for a visual');
      return false;
    }
  }
  
  // Check for domain-specific diagram requests (any type, not just OS migration)
  if (
    (lowercasePrompt.includes('migration') && lowercasePrompt.includes('diagram')) ||
    (lowercasePrompt.includes('rivermeadow') && (
      lowercasePrompt.includes('diagram') || 
      lowercasePrompt.includes('visual') || 
      lowercasePrompt.includes('picture') || 
      lowercasePrompt.includes('image'))
    )
  ) {
    console.log('Migration or RiverMeadow diagram request detected');
    return true;
  }
  
  // More focused detection for direct visual requests (expanded to include more terms)
  const containsVisualWords = 
    lowercasePrompt.includes('diagram') || 
    lowercasePrompt.includes('chart') || 
    lowercasePrompt.includes('graph') ||
    lowercasePrompt.includes('visualization') ||
    lowercasePrompt.includes('flowchart') ||
    lowercasePrompt.includes('architecture') ||
    lowercasePrompt.includes('picture') ||
    lowercasePrompt.includes('image') ||
    lowercasePrompt.includes('illustration') ||
    lowercasePrompt.includes('visual') ||
    lowercasePrompt.includes('infographic');
  
  if (!containsVisualWords) {
    return false;
  }
  
  // Additional check for action verbs specific to creating visuals (expanded list)
  const containsActionVerbs =
    lowercasePrompt.includes('create') ||
    lowercasePrompt.includes('draw') ||
    lowercasePrompt.includes('show') ||
    lowercasePrompt.includes('generate') ||
    lowercasePrompt.includes('visualize') ||
    lowercasePrompt.includes('make') ||
    lowercasePrompt.includes('design') ||
    lowercasePrompt.includes('illustrate') ||
    lowercasePrompt.includes('sketch') ||
    lowercasePrompt.includes('render') ||
    lowercasePrompt.includes('display') ||
    lowercasePrompt.includes('depict');
    
  if (containsActionVerbs && containsVisualWords) {
    console.log('Direct diagram request detected via keyword matching');
    return true;
  }
  
  // Default response based on combination of keywords with expanded visual terms
  const diagramScore = 
    // Primary diagram terms (higher weight)
    (lowercasePrompt.includes('flowchart') ? 2 : 0) +
    (lowercasePrompt.includes('diagram') ? 2 : 0) +
    (lowercasePrompt.includes('architecture') ? 2 : 0) +
    (lowercasePrompt.includes('chart') ? 2 : 0) +
    
    // Visual representation terms
    (lowercasePrompt.includes('picture') ? 1 : 0) +
    (lowercasePrompt.includes('image') ? 1 : 0) +
    (lowercasePrompt.includes('illustration') ? 1 : 0) +
    (lowercasePrompt.includes('visual') ? 1 : 0) +
    (lowercasePrompt.includes('graph') ? 1 : 0) +
    (lowercasePrompt.includes('visualization') ? 1 : 0) +
    (lowercasePrompt.includes('infographic') ? 1 : 0) +
    
    // Action verbs
    (lowercasePrompt.includes('visualize') ? 1 : 0) +
    (lowercasePrompt.includes('draw') ? 1 : 0) +
    (lowercasePrompt.includes('illustrate') ? 1 : 0) +
    (lowercasePrompt.includes('sketch') ? 1 : 0) +
    
    // Context boost
    (lowercasePrompt.includes('rivermeadow') ? 1 : 0) +
    (lowercasePrompt.includes('migration') ? 1 : 0);
  
  const isDiagramRequest = diagramScore >= 2;
  console.log(`Diagram detection score: ${diagramScore}, will ${isDiagramRequest ? '' : 'not '}generate diagram`);
  
  return isDiagramRequest;
};