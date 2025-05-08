// Configuration types for the application

/**
 * Interface for application configuration settings
 */
export interface AppConfig {
  // OpenAI model parameters
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  
  // Custom system prompt
  system_prompt?: string;
  
  // Vector search parameters
  vector_search_top_k?: number;
  
  // Interface settings
  enable_diagram_auto_zoom?: boolean;
  diagram_default_zoom?: number;
  
  // Diagram generation settings
  diagram_style?: 'modern' | 'technical' | 'minimal' | 'colorful';
  diagram_quality?: 'standard' | 'hd';
  diagram_size?: 'small' | 'medium' | 'large';
  enable_network_diagram_detection?: boolean;
  diagram_engine?: 'drawio' | 'mermaid' | 'd2';
  drawio_theme?: 'default' | 'dark' | 'kennedy' | 'minimal' | 'sketch';
  
  // D2-specific settings
  d2_theme?: number; // Theme ID (0-20)
  d2_dark_theme?: number; // Dark theme ID
  d2_layout?: 'dagre' | 'elk'; // Layout engine
  d2_sketch_mode?: boolean; // Hand-drawn style
  d2_pad?: number; // Padding around diagram
  d2_padding?: number; // Alternative name for padding
  d2_container_bg_color?: string; // Background color for diagram container
  
  // Node style presets
  d2_source_fill?: string; // Fill color for source nodes
  d2_source_stroke?: string; // Border color for source nodes
  d2_target_fill?: string; // Fill color for target nodes
  d2_target_stroke?: string; // Border color for target nodes
  
  // Advanced settings
  enable_debug_logs?: boolean;
  response_streaming?: boolean;
}

/**
 * Default configuration values
 */
export const defaultConfig: AppConfig = {
  // OpenAI model parameters
  model: "gpt-4o",
  temperature: 0.5,
  max_tokens: 2048,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
  
  // Custom system prompt
  system_prompt: "You are a helpful assistant. Use the context below to answer the question. If the answer is unclear or not directly provided, give your best interpretation based on the information.",
  
  // Vector search parameters
  vector_search_top_k: 50,
  
  // Interface settings
  enable_diagram_auto_zoom: true,
  diagram_default_zoom: 0.7,
  
  // Diagram generation settings
  diagram_style: "modern",
  diagram_quality: "standard",
  diagram_size: "medium",
  enable_network_diagram_detection: true,
  diagram_engine: "d2", // Changed default to D2
  drawio_theme: "default",
  
  // D2-specific settings
  d2_theme: 0, // Default theme (0)
  d2_dark_theme: -1, // Use regular theme for dark mode (-1 means no specific dark theme)
  d2_layout: "dagre", // Default layout engine
  d2_sketch_mode: false, // Hand-drawn style disabled by default
  d2_pad: 100, // Default padding (pixels)
  d2_padding: 100, // Alternative name for padding
  d2_container_bg_color: "#ffffff", // White background
  
  // Node style presets
  d2_source_fill: "#e6f7ff", // Fill color for source nodes
  d2_source_stroke: "#1890ff", // Border color for source nodes
  d2_target_fill: "#f6ffed", // Fill color for target nodes
  d2_target_stroke: "#52c41a", // Border color for target nodes
  
  // Advanced settings
  enable_debug_logs: false,
  response_streaming: true,
};