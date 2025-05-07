import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Download } from 'lucide-react';
import { DiagramViewer } from '@/components/DiagramViewer';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [diagramPath, setDiagramPath] = useState<string | null>(null);
  const [diagramType, setDiagramType] = useState<string | null>(null);
  const { toast } = useToast();

  // Generate a diagram based on the prompt
  const handleGenerateDiagram = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a prompt to generate a diagram',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGenerating(true);
      toast({
        title: 'Generating Diagram',
        description: 'Please wait while we create your diagram...',
      });

      // Call the API to generate the diagram
      const response = await apiRequest('POST', '/api/chat', {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 2048,
      });

      if (!response.ok) {
        throw new Error('Failed to generate diagram');
      }

      const data = await response.json();
      
      // Check if the response includes a diagram reference
      if (data.references && data.references.length > 0) {
        const diagramRef = data.references.find((ref: any) => ref.type === 'image');
        if (diagramRef) {
          setDiagramPath(diagramRef.imagePath);
          setDiagramType(diagramRef.caption || 'Generated Diagram');
          
          toast({
            title: 'Diagram Generated',
            description: 'Your diagram has been successfully created',
          });
        } else {
          throw new Error('No diagram found in response');
        }
      } else {
        throw new Error('No diagram reference in response');
      }
    } catch (error) {
      console.error('Error generating diagram:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate diagram',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">RiverMeadow Diagram Generator</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Diagram Creation Form */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Generate a Diagram</CardTitle>
            <CardDescription>
              Enter a prompt to create a diagram about RiverMeadow cloud migration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt</Label>
                <Input
                  id="prompt"
                  placeholder="e.g., Create a diagram showing OS-based migration process"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p>Try these example prompts:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Draw a diagram of the RiverMeadow OS migration process</li>
                  <li>Create a visualization of cloud migration using RiverMeadow</li>
                  <li>Generate a network diagram showing AWS migration</li>
                </ul>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleGenerateDiagram} 
              disabled={isGenerating || !prompt.trim()}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Diagram'
              )}
            </Button>
          </CardFooter>
        </Card>
        
        {/* Diagram Display */}
        <div className="flex flex-col space-y-4">
          {diagramPath ? (
            <>
              <h2 className="text-xl font-semibold">{diagramType}</h2>
              <DiagramViewer diagramPath={diagramPath} altText={diagramType || undefined} />
            </>
          ) : (
            <div className="flex items-center justify-center h-80 bg-muted rounded-lg border border-border">
              <div className="text-center p-8">
                <h3 className="text-lg font-medium mb-2">No Diagram Generated Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter a prompt and click "Generate Diagram" to create a visualization
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}