import { 
  InsertUser, User, 
  InsertDocument, Document, 
  InsertDocumentImage, DocumentImage,
  InsertMessage, Message,
  documents,
  documentImages,
  messages,
  users,
  chats,
  chatMessages,
  InsertChat,
  Chat,
  InsertChatMessage,
  ChatMessage,
  userPreferences,
  InsertUserPreference,
  UserPreference
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

// Interface for storage operations
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserLastLogin(id: number): Promise<void>;
  
  // Chat methods
  getChat(id: number): Promise<Chat | undefined>;
  getUserChats(userId: number): Promise<Chat[]>;
  createChat(chat: InsertChat): Promise<Chat>;
  updateChat(id: number, updates: Partial<Chat>): Promise<Chat>;
  deleteChat(id: number): Promise<void>;

  // Chat message methods
  getChatMessages(chatId: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  
  // User preferences methods
  getUserPreferences(userId: number): Promise<UserPreference[]>;
  getUserPreferenceByName(userId: number, name: string): Promise<UserPreference | undefined>;
  saveUserPreference(preference: InsertUserPreference): Promise<UserPreference>;
  updateUserPreference(id: number, value: any): Promise<UserPreference>;
  
  // Document methods
  getDocument(id: number): Promise<Document | undefined>;
  getAllDocuments(): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  
  // Document Image methods
  getDocumentImages(documentId: number): Promise<DocumentImage[]>;
  getDocumentImage(id: number): Promise<DocumentImage | undefined>;
  createDocumentImage(image: InsertDocumentImage): Promise<DocumentImage>;
  
  // Message methods
  getMessages(documentId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  // Configuration methods
  getConfig(): Promise<Record<string, any>>;
  saveConfig(config: Record<string, any>): Promise<Record<string, any>>;
  
  // Session store for authentication
  sessionStore: session.Store;
}

// Database implementation of the storage interface
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";
// Using PostgreSQL session store

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  private config: Record<string, any>;

  constructor() {
    const PostgresStore = connectPg(session);
    this.sessionStore = new PostgresStore({
      pool,
      createTableIfMissing: true,
    });
    this.config = {};
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const results = await db.select().from(users).where(eq(users.id, id));
    return results.length ? results[0] : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const results = await db.select().from(users).where(eq(users.username, username));
    return results.length ? results[0] : undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUserLastLogin(id: number): Promise<void> {
    await db.update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, id));
  }

  // Chat methods
  async getChat(id: number): Promise<Chat | undefined> {
    const results = await db.select().from(chats).where(eq(chats.id, id));
    return results.length ? results[0] : undefined;
  }

  async getUserChats(userId: number): Promise<Chat[]> {
    return db.select().from(chats)
      .where(eq(chats.userId, userId))
      .orderBy(desc(chats.updatedAt));
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const result = await db.insert(chats).values(chat).returning();
    return result[0];
  }

  async updateChat(id: number, updates: Partial<Chat>): Promise<Chat> {
    const result = await db.update(chats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chats.id, id))
      .returning();
    return result[0];
  }

  async deleteChat(id: number): Promise<void> {
    await db.delete(chats).where(eq(chats.id, id));
  }

  // Chat message methods
  async getChatMessages(chatId: number): Promise<ChatMessage[]> {
    return db.select().from(chatMessages)
      .where(eq(chatMessages.chatId, chatId))
      .orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const result = await db.insert(chatMessages).values(message).returning();
    
    // Update the last message timestamp on the chat
    await db.update(chats)
      .set({ 
        lastMessageAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(chats.id, message.chatId));
      
    return result[0];
  }

  // User preferences methods
  async getUserPreferences(userId: number): Promise<UserPreference[]> {
    return db.select().from(userPreferences)
      .where(eq(userPreferences.userId, userId));
  }

  async getUserPreferenceByName(userId: number, name: string): Promise<UserPreference | undefined> {
    const results = await db.select().from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.preferenceName, name)
        )
      );
    return results.length ? results[0] : undefined;
  }

  async saveUserPreference(preference: InsertUserPreference): Promise<UserPreference> {
    // Check if preference already exists
    const existing = await this.getUserPreferenceByName(
      preference.userId,
      preference.preferenceName
    );

    if (existing) {
      // Update existing preference
      const result = await db.update(userPreferences)
        .set({ 
          preferenceValue: preference.preferenceValue,
          updatedAt: new Date()
        })
        .where(eq(userPreferences.id, existing.id))
        .returning();
      return result[0];
    } else {
      // Create new preference
      const result = await db.insert(userPreferences)
        .values(preference)
        .returning();
      return result[0];
    }
  }

  async updateUserPreference(id: number, value: any): Promise<UserPreference> {
    const result = await db.update(userPreferences)
      .set({ 
        preferenceValue: value,
        updatedAt: new Date()
      })
      .where(eq(userPreferences.id, id))
      .returning();
    return result[0];
  }

  // Document methods
  async getDocument(id: number): Promise<Document | undefined> {
    const results = await db.select().from(documents).where(eq(documents.id, id));
    return results.length ? results[0] : undefined;
  }

  async getAllDocuments(): Promise<Document[]> {
    return db.select().from(documents);
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const result = await db.insert(documents).values(document).returning();
    return result[0];
  }

  // Document Image methods
  async getDocumentImages(documentId: number): Promise<DocumentImage[]> {
    return db.select().from(documentImages)
      .where(eq(documentImages.documentId, documentId));
  }

  async getDocumentImage(id: number): Promise<DocumentImage | undefined> {
    const results = await db.select().from(documentImages).where(eq(documentImages.id, id));
    return results.length ? results[0] : undefined;
  }

  async createDocumentImage(image: InsertDocumentImage): Promise<DocumentImage> {
    const result = await db.insert(documentImages).values(image).returning();
    return result[0];
  }

  // Message methods
  async getMessages(documentId: number): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.documentId, documentId))
      .orderBy(messages.timestamp);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(message).returning();
    return result[0];
  }

  // Configuration methods
  async getConfig(): Promise<Record<string, any>> {
    return { ...this.config };
  }

  async saveConfig(config: Record<string, any>): Promise<Record<string, any>> {
    this.config = { ...config };
    return this.config;
  }
}

// Create and export a singleton instance
export const storage = new DatabaseStorage();
