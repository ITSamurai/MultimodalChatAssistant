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
  
  // Advanced settings
  enable_debug_logs: false,
  response_streaming: true,
};