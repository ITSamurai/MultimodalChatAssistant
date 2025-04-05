import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define the User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Define the Document schema
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  contentText: text("content_text").notNull(),
  createdAt: text("created_at").notNull().default("NOW()"),
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  name: true,
  originalName: true,
  contentText: true,
});

// Define the DocumentImage schema
export const documentImages = pgTable("document_images", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  imagePath: text("image_path").notNull(),
  altText: text("alt_text"),
  caption: text("caption"),
  pageNumber: integer("page_number"),
});

export const insertDocumentImageSchema = createInsertSchema(documentImages).pick({
  documentId: true,
  imagePath: true,
  altText: true,
  caption: true,
  pageNumber: true,
});

// Define the Message schema
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  content: text("content").notNull(),
  role: text("role").notNull(), // 'system', 'user', 'assistant'
  timestamp: text("timestamp").notNull().default("NOW()"),
  references: jsonb("references"),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  documentId: true,
  content: true,
  role: true,
  references: true,
});

// Define the chat message schema for frontend usage
export const chatMessageSchema = z.object({
  id: z.number().optional(),
  content: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  timestamp: z.string().optional(),
  references: z.array(z.object({
    type: z.enum(["image", "text"]),
    id: z.number().optional(),
    content: z.string().optional(),
    caption: z.string().optional(),
    imagePath: z.string().optional(),
  })).optional(),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertDocumentImage = z.infer<typeof insertDocumentImageSchema>;
export type DocumentImage = typeof documentImages.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type ChatMessage = z.infer<typeof chatMessageSchema>;

// OpenAI API request/response types
export type OpenAICompletionRequest = {
  messages: {
    role: "system" | "user" | "assistant";
    content: string | Array<{
      type: "text" | "image_url";
      text?: string;
      image_url?: {
        url: string;
      };
    }>;
  }[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" };
};

export type OpenAICompletionResponse = {
  id: string;
  object: string;
  created: number;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length" | "content_filter";
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};
