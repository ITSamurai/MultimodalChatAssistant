import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ChevronLeftIcon, SaveIcon, RefreshCwIcon, SlidersIcon, MessageSquareTextIcon, SettingsIcon, BrainCircuitIcon, Image } from "lucide-react";
import { useLocation, Link } from "wouter";
import { AppConfig, defaultConfig } from "@/lib/config-types";

export default function ConfigPage() {
  const [config, setConfig] = useState({ ...defaultConfig });
  const [activeTab, setActiveTab] = useState("model");
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  
  // Query to fetch current config
  const { data, isLoading } = useQuery({
    queryKey: ['/api/config'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/config');
        if (!response.ok) {
          // If config doesn't exist yet, use default
          if (response.status === 404) {
            return defaultConfig;
          }
          throw new Error('Failed to fetch configuration');
        }
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error fetching config:', error);
        return defaultConfig;
      }
    }
  });
  
  // Mutation to save config
  const saveConfigMutation = useMutation({
    mutationFn: async (configData: typeof defaultConfig) => {
      const response = await apiRequest('POST', '/api/config', configData);
      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/config'] });
      toast({
        title: "Configuration saved",
        description: "Your settings have been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to save configuration",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Reset to default
  const handleReset = () => {
    setConfig({ ...defaultConfig });
    toast({
      title: "Configuration reset",
      description: "Settings reset to default values. Click Save to apply.",
    });
  };
  
  // Save config
  const handleSave = () => {
    saveConfigMutation.mutate(config);
  };
  
  // Update config when data is loaded
  useEffect(() => {
    if (data) {
      setConfig({ ...defaultConfig, ...data });
    }
  }, [data]);
  
  // Update a single config value
  const updateConfig = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation("/")}
            className="mr-2"
          >
            <ChevronLeftIcon className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-3xl font-bold">Configuration Settings</h1>
        </div>
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <svg 
            className="h-4 w-4" 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>Configure AI model and diagram settings</span>
        </div>
      </div>
      
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 mb-8">
          <TabsTrigger value="model">
            <BrainCircuitIcon className="h-4 w-4 mr-2" /> AI Model
          </TabsTrigger>
          <TabsTrigger value="prompt">
            <MessageSquareTextIcon className="h-4 w-4 mr-2" /> Prompts
          </TabsTrigger>
          <TabsTrigger value="retrieval">
            <SlidersIcon className="h-4 w-4 mr-2" /> Retrieval
          </TabsTrigger>
          <TabsTrigger value="diagrams">
            <Image className="h-4 w-4 mr-2" /> Diagrams
          </TabsTrigger>
          <TabsTrigger value="interface">
            <SettingsIcon className="h-4 w-4 mr-2" /> Interface
          </TabsTrigger>
        </TabsList>
        
        {/* Model Settings Tab */}
        <TabsContent value="model">
          <Card>
            <CardHeader>
              <CardTitle>AI Model Settings</CardTitle>
              <CardDescription>
                Configure the AI model parameters to control response generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Select 
                  value={config.model ?? "gpt-4o"} 
                  onValueChange={(value) => updateConfig('model', value)}
                >
                  <SelectTrigger id="model">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">GPT-4o (Recommended)</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                    <SelectItem value="gpt-4">GPT-4</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-1">
                  The OpenAI model to use for responses
                </p>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature: {(config.temperature || 0.5).toFixed(1)}</Label>
                <Slider 
                  id="temperature"
                  min={0} 
                  max={2} 
                  step={0.1}
                  value={[config.temperature ?? 0.5]}
                  onValueChange={(value) => updateConfig('temperature', value[0])}
                />
                <p className="text-sm text-muted-foreground">
                  Higher values (0.7-1.0) make responses more creative and varied. Lower values (0.1-0.4) make them more focused and deterministic.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="max_tokens">Max Tokens: {config.max_tokens ?? 2048}</Label>
                <Slider 
                  id="max_tokens"
                  min={256} 
                  max={4096} 
                  step={256}
                  value={[config.max_tokens ?? 2048]}
                  onValueChange={(value) => updateConfig('max_tokens', value[0])}
                />
                <p className="text-sm text-muted-foreground">
                  The maximum number of tokens to generate in the response
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="top_p">Top P: {(config.top_p ?? 1).toFixed(2)}</Label>
                <Slider 
                  id="top_p"
                  min={0.1} 
                  max={1} 
                  step={0.05}
                  value={[config.top_p ?? 1]}
                  onValueChange={(value) => updateConfig('top_p', value[0])}
                />
                <p className="text-sm text-muted-foreground">
                  Alternative to sampling with temperature, nucleus sampling considers the results of the tokens with top_p probability mass
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="frequency_penalty">Frequency Penalty: {(config.frequency_penalty ?? 0).toFixed(2)}</Label>
                  <Slider 
                    id="frequency_penalty"
                    min={-2} 
                    max={2} 
                    step={0.1}
                    value={[config.frequency_penalty ?? 0]}
                    onValueChange={(value) => updateConfig('frequency_penalty', value[0])}
                  />
                  <p className="text-sm text-muted-foreground">
                    Positive values discourage repetition
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="presence_penalty">Presence Penalty: {(config.presence_penalty ?? 0).toFixed(2)}</Label>
                  <Slider 
                    id="presence_penalty"
                    min={-2} 
                    max={2} 
                    step={0.1}
                    value={[config.presence_penalty ?? 0]}
                    onValueChange={(value) => updateConfig('presence_penalty', value[0])}
                  />
                  <p className="text-sm text-muted-foreground">
                    Positive values encourage new topics
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Prompts Tab */}
        <TabsContent value="prompt">
          <Card>
            <CardHeader>
              <CardTitle>Prompt Settings</CardTitle>
              <CardDescription>
                Configure system prompts used when communicating with the AI
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="system_prompt">System Prompt</Label>
                <textarea 
                  id="system_prompt"
                  value={config.system_prompt ?? "You are a helpful assistant. Use the context below to answer the question. If the answer is unclear or not directly provided, give your best interpretation based on the information.\n\nContext: {context}\n\nQuestion: {question}"}
                  onChange={(e) => updateConfig('system_prompt', e.target.value)}
                  className="w-full min-h-[200px] p-3 rounded-md border border-input bg-background"
                />
                <p className="text-sm text-muted-foreground">
                  This prompt guides the AI on how to respond to queries. Use {'{context}'} and {'{question}'} for placeholders.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Retrieval Tab */}
        <TabsContent value="retrieval">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Retrieval Settings</CardTitle>
              <CardDescription>
                Configure how the application retrieves information from the vector database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="vector_search_top_k">Vector Search Results: {config.vector_search_top_k ?? 50}</Label>
                <Slider 
                  id="vector_search_top_k"
                  min={5} 
                  max={100} 
                  step={5}
                  value={[config.vector_search_top_k ?? 50]}
                  onValueChange={(value) => updateConfig('vector_search_top_k', value[0])}
                />
                <p className="text-sm text-muted-foreground">
                  Number of most relevant documents to retrieve from the knowledge base (higher values provide more context but may be slower)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Diagrams Tab */}
        <TabsContent value="diagrams">
          <Card>
            <CardHeader>
              <CardTitle>Diagram Generation Settings</CardTitle>
              <CardDescription>
                Configure how diagrams are generated and displayed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="diagram_engine">Diagram Engine</Label>
                <Select 
                  value={config.diagram_engine ?? "d2"} 
                  onValueChange={(value) => updateConfig('diagram_engine', value)}
                >
                  <SelectTrigger id="diagram_engine">
                    <SelectValue placeholder="Select engine" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="d2">D2 (Recommended)</SelectItem>
                    <SelectItem value="drawio">Draw.IO</SelectItem>
                    <SelectItem value="mermaid">Mermaid</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-1">
                  The underlying technology used to render diagrams
                </p>
              </div>

              <Separator />
              
              {/* D2-specific Settings */}
              {config.diagram_engine === "d2" && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium">D2 Diagram Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="d2_theme">Theme ID</Label>
                      <Select 
                        value={String(config.d2_theme ?? 0)} 
                        onValueChange={(value) => updateConfig('d2_theme', parseInt(value))}
                      >
                        <SelectTrigger id="d2_theme">
                          <SelectValue placeholder="Select theme" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Default (0)</SelectItem>
                          <SelectItem value="1">Theme 1 (Blue)</SelectItem>
                          <SelectItem value="2">Theme 2 (Green)</SelectItem>
                          <SelectItem value="3">Theme 3 (Orange)</SelectItem>
                          <SelectItem value="4">Theme 4 (Neutral)</SelectItem>
                          <SelectItem value="5">Theme 5 (Purple)</SelectItem>
                          <SelectItem value="6">Theme 6 (Yellow)</SelectItem>
                          <SelectItem value="7">Theme 7 (Cyan)</SelectItem>
                          <SelectItem value="8">Theme 8 (Red)</SelectItem>
                          <SelectItem value="9">Theme 9 (Teal)</SelectItem>
                          <SelectItem value="10">Theme 10 (Pink)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground mt-1">
                        Color theme ID for D2 diagrams (light mode)
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="d2_dark_theme">Dark Theme ID</Label>
                      <Select 
                        value={String(config.d2_dark_theme ?? -1)} 
                        onValueChange={(value) => updateConfig('d2_dark_theme', parseInt(value))}
                      >
                        <SelectTrigger id="d2_dark_theme">
                          <SelectValue placeholder="Select dark theme" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1">Use Regular Theme (-1)</SelectItem>
                          <SelectItem value="0">Dark Default (0)</SelectItem>
                          <SelectItem value="1">Dark Theme 1</SelectItem>
                          <SelectItem value="2">Dark Theme 2</SelectItem>
                          <SelectItem value="3">Dark Theme 3</SelectItem>
                          <SelectItem value="4">Dark Theme 4</SelectItem>
                          <SelectItem value="5">Dark Theme 5</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground mt-1">
                        Theme ID for dark mode viewing (-1 uses regular theme)
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="d2_layout">Layout Engine</Label>
                    <Select 
                      value={config.d2_layout ?? "dagre"} 
                      onValueChange={(value) => updateConfig('d2_layout', value)}
                    >
                      <SelectTrigger id="d2_layout">
                        <SelectValue placeholder="Select layout" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dagre">Dagre (Default)</SelectItem>
                        <SelectItem value="elk">ELK (Better for complex diagrams)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground mt-1">
                      Layout algorithm for arranging diagram elements
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="d2_pad">Padding: {config.d2_pad ?? 100}px</Label>
                    <Slider 
                      id="d2_pad"
                      min={0} 
                      max={200} 
                      step={10}
                      value={[config.d2_pad ?? 100]}
                      onValueChange={(value) => updateConfig('d2_pad', value[0])}
                    />
                    <p className="text-sm text-muted-foreground">
                      Padding around the generated diagram in pixels
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="d2_sketch_mode">Sketch Mode</Label>
                        <p className="text-sm text-muted-foreground">
                          Render diagrams with a hand-drawn appearance
                        </p>
                      </div>
                      <Switch 
                        id="d2_sketch_mode"
                        checked={config.d2_sketch_mode ?? false}
                        onCheckedChange={(checked) => updateConfig('d2_sketch_mode', checked)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="d2_container_bg_color">Background Color</Label>
                      <div className="flex gap-2">
                        <Input 
                          id="d2_container_bg_color"
                          type="color" 
                          value={config.d2_container_bg_color ?? "#ffffff"} 
                          onChange={(e) => updateConfig('d2_container_bg_color', e.target.value)}
                          className="w-16 h-10 p-1"
                        />
                        <Input 
                          type="text" 
                          value={config.d2_container_bg_color ?? "#ffffff"} 
                          onChange={(e) => updateConfig('d2_container_bg_color', e.target.value)}
                          className="w-32 h-10"
                          placeholder="#ffffff"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Background color for the diagram container
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-6 p-4 bg-accent/50 rounded-md border border-border">
                    <h4 className="text-md font-medium mb-2">D2 Diagram Tips</h4>
                    <ul className="text-sm space-y-1 list-disc pl-5">
                      <li>The D2 layout engine offers clean, programmatic diagrams that are excellent for technical documentation</li>
                      <li>Sketch mode creates hand-drawn style diagrams that look more creative and informal</li>
                      <li>Try different themes to find the best visual style for your specific diagram content</li>
                      <li>Use ELK layout for more complex diagrams with many nodes and connections</li>
                      <li>The Dark Theme option allows setting a separate theme for dark mode viewing</li>
                    </ul>
                  </div>
                </div>
              )}
              
              {/* Draw.IO Specific Settings */}
              {config.diagram_engine === "drawio" && (
                <div className="space-y-2">
                  <Label htmlFor="drawio_theme">Draw.IO Theme</Label>
                  <Select 
                    value={config.drawio_theme ?? "default"} 
                    onValueChange={(value) => updateConfig('drawio_theme', value)}
                  >
                    <SelectTrigger id="drawio_theme">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="kennedy">Kennedy (Blue theme)</SelectItem>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="sketch">Sketch (Hand-drawn style)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground mt-1">
                    Visual theme for Draw.IO diagrams
                  </p>
                </div>
              )}
              
              <Separator />
              
              <div className="space-y-2">
                <Label htmlFor="diagram_style">Diagram Style</Label>
                <Select 
                  value={config.diagram_style ?? "modern"} 
                  onValueChange={(value) => updateConfig('diagram_style', value)}
                >
                  <SelectTrigger id="diagram_style">
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern">Modern (Clean with subtle gradients)</SelectItem>
                    <SelectItem value="technical">Technical (Precise, professional)</SelectItem>
                    <SelectItem value="minimal">Minimal (Simple, high contrast)</SelectItem>
                    <SelectItem value="colorful">Colorful (Vibrant, high emphasis)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-1">
                  Visual style for generated diagrams
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="diagram_quality">Diagram Quality</Label>
                  <Select 
                    value={config.diagram_quality ?? "standard"} 
                    onValueChange={(value) => updateConfig('diagram_quality', value)}
                  >
                    <SelectTrigger id="diagram_quality">
                      <SelectValue placeholder="Select quality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard (Faster generation)</SelectItem>
                      <SelectItem value="hd">HD (Higher resolution)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground mt-1">
                    Resolution quality for diagrams
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="diagram_size">Diagram Size</Label>
                  <Select 
                    value={config.diagram_size ?? "medium"} 
                    onValueChange={(value) => updateConfig('diagram_size', value)}
                  >
                    <SelectTrigger id="diagram_size">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small (1024×1024)</SelectItem>
                      <SelectItem value="medium">Medium (1280×1280)</SelectItem>
                      <SelectItem value="large">Large (1536×1536)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground mt-1">
                    Canvas size for generated diagrams
                  </p>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enable_network_diagram_detection">Network Diagram Detection</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically detect and optimize network diagram requests
                  </p>
                </div>
                <Switch 
                  id="enable_network_diagram_detection"
                  checked={config.enable_network_diagram_detection ?? true}
                  onCheckedChange={(checked) => updateConfig('enable_network_diagram_detection', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Interface Tab */}
        <TabsContent value="interface">
          <Card>
            <CardHeader>
              <CardTitle>Interface Settings</CardTitle>
              <CardDescription>
                Configure user interface behavior and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enable_diagram_auto_zoom">Auto-Zoom Diagrams</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically adjust diagram zoom to fit viewport
                  </p>
                </div>
                <Switch 
                  id="enable_diagram_auto_zoom"
                  checked={config.enable_diagram_auto_zoom ?? true}
                  onCheckedChange={(checked) => updateConfig('enable_diagram_auto_zoom', checked)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="diagram_default_zoom">Default Diagram Zoom: {((config.diagram_default_zoom ?? 0.7) * 100).toFixed(0)}%</Label>
                <Slider 
                  id="diagram_default_zoom"
                  min={0.3} 
                  max={1} 
                  step={0.05}
                  value={[config.diagram_default_zoom ?? 0.7]}
                  onValueChange={(value) => updateConfig('diagram_default_zoom', value[0])}
                />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enable_debug_logs">Enable Debug Logs</Label>
                  <p className="text-sm text-muted-foreground">
                    Show additional debug information in the console
                  </p>
                </div>
                <Switch 
                  id="enable_debug_logs"
                  checked={config.enable_debug_logs ?? false}
                  onCheckedChange={(checked) => updateConfig('enable_debug_logs', checked)}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="response_streaming">Stream Responses</Label>
                  <p className="text-sm text-muted-foreground">
                    Show AI responses as they are generated instead of waiting for complete response
                  </p>
                </div>
                <Switch 
                  id="response_streaming"
                  checked={config.response_streaming ?? true}
                  onCheckedChange={(checked) => updateConfig('response_streaming', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="flex justify-end mt-8 space-x-4">
        <Button 
          variant="outline" 
          onClick={handleReset}
          disabled={isLoading || saveConfigMutation.isPending}
        >
          <RefreshCwIcon className="h-4 w-4 mr-2" /> Reset to Default
        </Button>
        <Button 
          onClick={handleSave}
          disabled={isLoading || saveConfigMutation.isPending}
        >
          {saveConfigMutation.isPending ? (
            <>
              <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </>
          ) : (
            <>
              <SaveIcon className="h-4 w-4 mr-2" /> Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}