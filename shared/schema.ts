import { pgTable, text, serial, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define the User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  name: text("name"),
  role: text("role").notNull().default("user"), // "superadmin", "admin", "user"
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User preferences for storing UI preferences, layouts, etc.
export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  preferenceName: text("preference_name").notNull(),
  preferenceValue: jsonb("preference_value").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Chat rooms/sessions
export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at"),
});

// Chat messages (history)
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull(),
  content: text("content").notNull(),
  role: text("role").notNull(), // 'system', 'user', 'assistant'
  references: jsonb("references"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Define relations after all tables are defined
export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats),
  userPreferences: many(userPreferences),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMessages.chatId],
    references: [chats.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  name: true,
  role: true,
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

// Create insert schemas for the new tables
export const insertUserPreferenceSchema = createInsertSchema(userPreferences).pick({
  userId: true,
  preferenceName: true,
  preferenceValue: true,
});

export const insertChatSchema = createInsertSchema(chats).pick({
  userId: true,
  title: true,
  description: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).pick({
  chatId: true,
  content: true,
  role: true,
  references: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertUserPreference = z.infer<typeof insertUserPreferenceSchema>;
export type UserPreference = typeof userPreferences.$inferSelect;

export type InsertChat = z.infer<typeof insertChatSchema>;
export type Chat = typeof chats.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertDocumentImage = z.infer<typeof insertDocumentImageSchema>;
export type DocumentImage = typeof documentImages.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type LegacyChatMessage = z.infer<typeof chatMessageSchema>;

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
