import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { v4 as uuidv4 } from 'uuid';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { addKnowledgeToPinecone, KnowledgeItem } from '../lib/api';

// Define form validation schema
const formSchema = z.object({
  text: z.string().min(1, {
    message: 'Knowledge content is required',
  }).max(10000, {
    message: 'Knowledge content must be less than 10000 characters',
  }),
  metadata: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function AddKnowledge() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  // Initialize form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      text: '',
      metadata: '',
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    
    try {
      // Parse metadata string to JSON if provided
      let metadataObj: Record<string, any> | undefined;
      
      if (data.metadata) {
        try {
          metadataObj = JSON.parse(data.metadata);
        } catch (error) {
          toast({
            title: "Invalid Metadata",
            description: "Metadata must be valid JSON",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      }
      
      // Create knowledge item
      const knowledgeItem: KnowledgeItem = {
        id: uuidv4(), // Generate a unique ID
        text: data.text,
        metadata: metadataObj,
      };
      
      // Send to API
      const result = await addKnowledgeToPinecone([knowledgeItem]);
      
      // Show success message
      toast({
        title: "Knowledge Added",
        description: `Successfully added knowledge to the database`,
      });
      
      // Reset form
      form.reset();
      
    } catch (error) {
      console.error('Error adding knowledge:', error);
      toast({
        title: "Error",
        description: "Failed to add knowledge. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Add Knowledge</CardTitle>
        <CardDescription>
          Add information to your knowledge base for the AI to use
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Knowledge Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter knowledge content here..."
                      className="min-h-[200px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="metadata"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metadata (Optional JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='{"source": "Wikipedia", "category": "Science"}'
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add to Knowledge Base'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}