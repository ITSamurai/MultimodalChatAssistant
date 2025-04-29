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
import { ChevronLeftIcon, SaveIcon, RefreshCwIcon, SlidersIcon, MessageSquareTextIcon, SettingsIcon, BrainCircuitIcon } from "lucide-react";
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
      <div className="flex items-center mb-8">
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
      
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-8">
          <TabsTrigger value="model">
            <BrainCircuitIcon className="h-4 w-4 mr-2" /> AI Model
          </TabsTrigger>
          <TabsTrigger value="prompt">
            <MessageSquareTextIcon className="h-4 w-4 mr-2" /> Prompts
          </TabsTrigger>
          <TabsTrigger value="retrieval">
            <SlidersIcon className="h-4 w-4 mr-2" /> Retrieval
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