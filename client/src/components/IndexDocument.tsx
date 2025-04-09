import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Document } from '@shared/schema';
import { getDocuments, indexDocumentInPinecone } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export function IndexDocument() {
  const [indexingDocument, setIndexingDocument] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all documents
  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['/api/documents'],
    queryFn: getDocuments,
  });

  // Mutation for indexing a document
  const indexMutation = useMutation({
    mutationFn: (documentId: number) => indexDocumentInPinecone(documentId),
    onSuccess: (data, documentId) => {
      toast({
        title: 'Document Indexed',
        description: `Successfully indexed document in Pinecone`,
      });
      setIndexingDocument(null);
    },
    onError: (error, documentId) => {
      console.error(`Error indexing document ${documentId}:`, error);
      toast({
        title: 'Indexing Failed',
        description: 'Failed to index document in Pinecone',
        variant: 'destructive',
      });
      setIndexingDocument(null);
    },
  });

  const handleIndex = (documentId: number) => {
    setIndexingDocument(documentId);
    indexMutation.mutate(documentId);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        Error loading documents: {(error as Error).message}
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Index Documents</CardTitle>
        <CardDescription>
          Add your documents to the vector database for AI to search and reference
        </CardDescription>
      </CardHeader>
      <CardContent>
        {documents && documents.length > 0 ? (
          <div className="space-y-4">
            {documents.map((doc: Document) => (
              <div key={doc.id} className="flex justify-between items-center p-4 border rounded-md">
                <div>
                  <h3 className="font-medium">{doc.name}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(doc.createdAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  onClick={() => handleIndex(doc.id)}
                  disabled={indexingDocument === doc.id}
                  variant="outline"
                >
                  {indexingDocument === doc.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Indexing...
                    </>
                  ) : (
                    'Index Document'
                  )}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-8 text-gray-500">
            No documents available. Upload documents first.
          </div>
        )}
      </CardContent>
    </Card>
  );
}