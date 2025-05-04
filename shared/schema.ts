import { pgTable, text, serial, integer, boolean, jsonb, timestamp, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Define the User schema 
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  name: text("name"),
  role: text("role").default("user").notNull(),  // "admin" or "user"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  name: true,
  role: true,
  updatedAt: true,
});

// Define relationships for users
export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats),
  userLayouts: many(userLayouts),
}));

// Define the Chat schema (conversation threads)
export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChatSchema = createInsertSchema(chats).pick({
  userId: true,
  title: true,
});

// Define relationships for chats
export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, { fields: [chats.userId], references: [users.id] }),
  messages: many(chatMessages),
}));

// Define the Chat Message schema (individual messages within a chat)
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => chats.id, { onDelete: 'cascade' }),
  content: text("content").notNull(),
  role: text("role").notNull(), // 'system', 'user', 'assistant'
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  references: jsonb("references"), // For storing diagrams and other references
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).pick({
  chatId: true,
  content: true,
  role: true,
  references: true,
});

// Define relationships for chatMessages
export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  chat: one(chats, { fields: [chatMessages.chatId], references: [chats.id] }),
}));

// User Layout for saving UI preferences
export const userLayouts = pgTable("user_layouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  layout: jsonb("layout").notNull(), // Store layout preferences as JSON
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserLayoutSchema = createInsertSchema(userLayouts).pick({
  userId: true,
  layout: true,
  name: true,
  isDefault: true,
});

// Define relationships for userLayouts
export const userLayoutsRelations = relations(userLayouts, ({ one }) => ({
  user: one(users, { fields: [userLayouts.userId], references: [users.id] }),
}));

// Keep the document-related models (for compatibility with existing code)
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

// Define the Message schema (legacy)
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

export type InsertChat = z.infer<typeof insertChatSchema>;
export type Chat = typeof chats.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertUserLayout = z.infer<typeof insertUserLayoutSchema>;
export type UserLayout = typeof userLayouts.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertDocumentImage = z.infer<typeof insertDocumentImageSchema>;
export type DocumentImage = typeof documentImages.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type ChatMessageFrontend = z.infer<typeof chatMessageSchema>;

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
