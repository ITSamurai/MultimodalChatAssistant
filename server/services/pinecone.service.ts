import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { storage } from '../storage';

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default index configuration
const INDEX_NAME = 'rivermeadow-doc-index';
const NAMESPACE = 'default';
const EMBEDDING_MODEL = 'text-embedding-3-small'; // Using text-embedding-3-small as requested
const VECTOR_DIMENSION = 1536; // Dimension size for text-embedding-3-small

// Interface for vector records
interface VectorRecord {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}

/**
 * Initialize Pinecone index if it doesn't exist
 */
export async function initializePineconeIndex() {
  try {
    console.log(`Connecting to existing Pinecone index: ${INDEX_NAME}`);
    return pinecone.index(INDEX_NAME);
  } catch (error) {
    console.error('Error connecting to Pinecone index:', error);
    throw new Error('Failed to connect to Pinecone index');
  }
}

/**
 * Generate embeddings for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      encoding_format: 'float',
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw new Error('Failed to generate embeddings');
  }
}

/**
 * Index a collection of text chunks into Pinecone
 */
export async function indexVectors(records: VectorRecord[]) {
  try {
    if (records.length === 0) return;
    
    const index = await initializePineconeIndex();
    const indexingBatchSize = 100; // Pinecone recommends batches of 100 or fewer
    
    console.log(`Indexing ${records.length} vectors into Pinecone...`);
    
    // Process in batches
    for (let i = 0; i < records.length; i += indexingBatchSize) {
      const batch = records.slice(i, i + indexingBatchSize);
      const batchVectors = await Promise.all(
        batch.map(async (record) => {
          const embedding = await generateEmbedding(record.text);
          return {
            id: record.id,
            values: embedding,
            metadata: {
              ...record.metadata,
              text: record.text,
            },
          };
        })
      );
      
      // Upsert the batch
      await index.upsert(batchVectors);
      console.log(`Indexed batch of ${batch.length} vectors`);
    }
    
    console.log('Indexing complete!');
  } catch (error) {
    console.error('Error indexing vectors:', error);
    throw new Error('Failed to index vectors');
  }
}

/**
 * Query the Pinecone index for similar content
 */
export async function querySimilarVectors(query: string, topK: number = 5): Promise<{
  text: string;
  score: number | 0;
  metadata?: Record<string, any>;
}[]> {
  try {
    const index = await initializePineconeIndex();
    const queryEmbedding = await generateEmbedding(query);
    
    console.log(`Querying Pinecone index with: "${query.substring(0, 50)}..."`);
    
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });
    
    // Format and return the results
    const results = queryResponse.matches?.map(match => ({
      text: match.metadata?.text as string,
      score: match.score || 0,  // Default to 0 if score is undefined
      metadata: match.metadata as Record<string, any>,
    })) || [];
    
    console.log(`Found ${results.length} similar vectors`);
    return results;
  } catch (error) {
    console.error('Error querying vectors:', error);
    throw new Error('Failed to query vectors');
  }
}

/**
 * Chunk text into smaller segments for better indexing
 */
export function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  // Split by paragraphs first (preserves most meaning)
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph exceeds the chunk size, save current chunk and start a new one
    if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    
    // If the paragraph itself is too long, split it into sentences
    if (paragraph.length > maxChunkSize) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // If the sentence itself is too long, split arbitrarily
        if (sentence.length > maxChunkSize) {
          let remainingSentence = sentence;
          while (remainingSentence.length > 0) {
            const chunk = remainingSentence.substring(0, maxChunkSize);
            chunks.push(chunk.trim());
            remainingSentence = remainingSentence.substring(maxChunkSize);
          }
        } else {
          currentChunk += ' ' + sentence;
        }
      }
    } else {
      currentChunk += ' ' + paragraph;
    }
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Process a document and index it in Pinecone
 */
export async function indexDocumentInPinecone(documentId: number) {
  try {
    console.log(`Indexing document ${documentId} in Pinecone...`);
    
    // Get the document from storage
    const document = await storage.getDocument(documentId);
    if (!document) {
      throw new Error(`Document with ID ${documentId} not found`);
    }
    
    // Skip if the document has no content
    if (!document.contentText || document.contentText.length < 100) {
      console.log('Document has insufficient content for indexing');
      return;
    }
    
    // Chunk the document content
    const chunks = chunkText(document.contentText);
    console.log(`Split document into ${chunks.length} chunks for indexing`);
    
    // Prepare vector records
    const vectorRecords: VectorRecord[] = chunks.map((chunk, index) => ({
      id: `doc-${documentId}-chunk-${index}`,
      text: chunk,
      metadata: {
        documentId,
        documentName: document.name,
        chunkIndex: index,
      },
    }));
    
    // Index the vectors
    await indexVectors(vectorRecords);
    console.log(`Successfully indexed document ${documentId} in Pinecone`);
    
  } catch (error) {
    console.error(`Error indexing document ${documentId}:`, error);
    throw new Error(`Failed to index document ${documentId}`);
  }
}

/**
 * Add arbitrary knowledge to the vector database
 */
export async function addKnowledgeToPinecone(knowledge: {
  id: string; 
  text: string;
  metadata?: Record<string, any>;
}[]) {
  try {
    console.log(`Adding ${knowledge.length} knowledge items to Pinecone...`);
    
    // Process each knowledge item
    const vectorRecords: VectorRecord[] = [];
    
    for (const item of knowledge) {
      // Chunk long text
      if (item.text.length > 1000) {
        const chunks = chunkText(item.text);
        chunks.forEach((chunk, index) => {
          vectorRecords.push({
            id: `${item.id}-chunk-${index}`,
            text: chunk,
            metadata: {
              ...item.metadata,
              originalId: item.id,
              chunkIndex: index,
              totalChunks: chunks.length,
            },
          });
        });
      } else {
        vectorRecords.push({
          id: item.id,
          text: item.text,
          metadata: item.metadata,
        });
      }
    }
    
    // Index the vectors
    await indexVectors(vectorRecords);
    console.log(`Successfully added ${vectorRecords.length} knowledge vectors to Pinecone`);
    
  } catch (error) {
    console.error('Error adding knowledge to Pinecone:', error);
    throw new Error('Failed to add knowledge to Pinecone');
  }
}

/**
 * Create a chat completion that incorporates relevant knowledge from Pinecone
 */
export async function createChatWithKnowledgeBase(messages: Array<{
  role: "system" | "user" | "assistant";
  content: string;
}>, options?: {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  try {
    console.log('Starting chat with knowledge base. Messages received:', JSON.stringify(messages));
    
    // Validate input
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('No valid messages provided');
    }
    
    // Get the user's latest message
    const userMessages = messages.filter(m => m.role === "user");
    
    if (userMessages.length === 0) {
      throw new Error('No user messages found in the conversation');
    }
    
    const latestUserMessage = userMessages[userMessages.length - 1].content;
    console.log('Latest user message:', latestUserMessage);
    
    // Query Pinecone for relevant knowledge
    console.log('Querying Pinecone for knowledge...');
    const similarVectors = await querySimilarVectors(latestUserMessage, 50); // Increased topK to 50 as requested
    console.log(`Found ${similarVectors.length} relevant vectors from knowledge base`);
    
    // Extract and format the knowledge
    let knowledgeContext = "";
    if (similarVectors.length > 0) {
      knowledgeContext = "Relevant information from knowledge base:\n\n" + 
        similarVectors.map((vector, index) => 
          `[${index + 1}] ${vector.text}`
        ).join("\n\n");
      
      console.log("Retrieved context from knowledge base:", knowledgeContext.substring(0, 200) + "...");
    } else {
      knowledgeContext = "No specific information found in knowledge base for this query.";
      console.log("No relevant information found in knowledge base.");
    }
    
    // Create a new system message that includes the knowledge context
    const enhancedMessages = [...messages];
    
    // Find if there's already a system message
    const systemMessageIndex = enhancedMessages.findIndex(m => m.role === "system");
    
    const systemMessage = {
      role: "system" as const,
      content: `You are a helpful assistant. Use the context below to answer the question.

If the answer is unclear or not directly provided, give your best interpretation based on the information.

Context:
${knowledgeContext}

Question:
${latestUserMessage}`,
    };
    
    // Either replace the existing system message or add a new one at the beginning
    if (systemMessageIndex >= 0) {
      enhancedMessages[systemMessageIndex] = systemMessage;
    } else {
      enhancedMessages.unshift(systemMessage);
    }
    
    console.log('Calling OpenAI with enhanced messages...');
    
    // Call OpenAI with the enhanced messages
    try {
      const response = await openai.chat.completions.create({
        model: options?.model || "gpt-4o",
        messages: enhancedMessages,
        max_tokens: options?.maxTokens || 1000,
        temperature: options?.temperature || 0.3,
      });
      
      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error('Empty response received from OpenAI');
      }
      
      console.log('Received response from OpenAI');
      return response.choices[0].message;
    } catch (e) {
      const openAiError = e as Error;
      console.error('OpenAI API error:', openAiError);
      const errorMessage = openAiError?.message || 'Unknown error';
      throw new Error(`OpenAI API error: ${errorMessage}`);
    }
  } catch (e) {
    const error = e as Error;
    console.error('Error creating chat with knowledge base:', error);
    const errorMessage = error?.message || 'Unknown error';
    throw new Error(`Failed to create chat with knowledge base: ${errorMessage}`);
  }
}