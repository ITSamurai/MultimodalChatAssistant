import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { generateDiagram } from '../lib/api';
import { getFullUrl } from '@/lib/config';
import { Loader2, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from "@/components/ui/progress";

export function DiagramTestComponent() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [generatedImagePath, setGeneratedImagePath] = useState<string | null>(null);
  const [altText, setAltText] = useState<string | null>(null);
  const { toast } = useToast();

  const testNetworkDiagram = async () => {
    try {
      setIsLoading(true);
      setLoadingProgress(0);
      
      // Simulate progress for better UX
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          const increment = prev < 30 ? 5 : prev < 70 ? 3 : 1;
          return Math.min(prev + increment, 95);
        });
      }, 500);
      
      toast({
        title: "Generating diagram",
        description: "Testing direct diagram generation...",
      });
      
      // Use sample network diagram prompt
      const result = await generateDiagram(
        "Create a network diagram showing AWS VPC with EC2 instances and RDS database",
        "The diagram should show a secure AWS architecture with public and private subnets."
      );
      
      clearInterval(interval);
      setLoadingProgress(100);
      
      setGeneratedImagePath(result.imagePath);
      setAltText(result.altText);
      
      toast({
        title: "Success",
        description: "Diagram generated successfully!",
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("Error testing diagram generation:", error);
      toast({
        title: "Error",
        description: `Failed to generate diagram: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setLoadingProgress(0);
      }, 1000);
    }
  };

  const testMigrationDiagram = async () => {
    try {
      setIsLoading(true);
      setLoadingProgress(0);
      
      // Simulate progress for better UX
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          const increment = prev < 30 ? 5 : prev < 70 ? 3 : 1;
          return Math.min(prev + increment, 95);
        });
      }, 500);
      
      toast({
        title: "Generating diagram",
        description: "Testing direct diagram generation...",
      });
      
      // Use sample migration diagram prompt
      const result = await generateDiagram(
        "Create a migration flowchart for Windows to Linux migration",
        "The diagram should show the process of migrating from Windows Server to Linux systems."
      );
      
      clearInterval(interval);
      setLoadingProgress(100);
      
      setGeneratedImagePath(result.imagePath);
      setAltText(result.altText);
      
      toast({
        title: "Success",
        description: "Diagram generated successfully!",
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("Error testing diagram generation:", error);
      toast({
        title: "Error",
        description: `Failed to generate diagram: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setLoadingProgress(0);
      }, 1000);
    }
  };

  return (
    <div className="container p-6">
      <h1 className="text-2xl font-bold mb-6">Diagram Generation Test</h1>
      
      <div className="flex gap-4 mb-6">
        <Button 
          onClick={testNetworkDiagram}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Test Network Diagram
        </Button>
        
        <Button 
          onClick={testMigrationDiagram}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Test Migration Diagram
        </Button>
      </div>
      
      {loadingProgress > 0 && (
        <div className="mb-6">
          <div className="flex items-center mb-2">
            <span className="text-sm">
              Generating diagram{loadingProgress < 100 ? '...' : ' complete!'}
            </span>
          </div>
          <Progress value={loadingProgress} className="w-full h-2" />
        </div>
      )}
      
      {generatedImagePath && (
        <Card className="overflow-hidden mb-6">
          <CardContent className="p-0">
            <div className="relative">
              <img 
                src={getFullUrl(generatedImagePath)} 
                alt={altText || "Generated diagram"} 
                className="w-full h-auto" 
              />
              <div className="absolute top-2 right-2 bg-white rounded shadow-md">
                <a
                  href={getFullUrl(generatedImagePath)}
                  download={`diagram_${Date.now()}.png`}
                  className="p-2 hover:bg-gray-100 flex items-center text-gray-700"
                >
                  <Download size={16} className="mr-1" /> Download
                </a>
              </div>
            </div>
            {altText && (
              <div className="p-4 text-sm text-gray-600">
                {altText}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}