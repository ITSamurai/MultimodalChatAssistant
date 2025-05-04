import { 
  InsertUser, User, 
  InsertDocument, Document, 
  InsertDocumentImage, DocumentImage,
  InsertMessage, Message,
  InsertChat, Chat,
  InsertChatMessage, ChatMessage,
  InsertUserLayout, UserLayout,
  documents,
  documentImages,
  messages,
  users,
  chats,
  chatMessages,
  userLayouts
} from "@shared/schema";
import session from "express-session";

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
  updateChatTitle(id: number, title: string): Promise<Chat | undefined>;
  deleteChat(id: number): Promise<void>;
  
  // Chat Message methods
  getChatMessages(chatId: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  
  // User Layout methods
  getUserLayouts(userId: number): Promise<UserLayout[]>;
  getUserDefaultLayout(userId: number): Promise<UserLayout | undefined>;
  createUserLayout(layout: InsertUserLayout): Promise<UserLayout>;
  updateUserLayout(id: number, layout: Partial<UserLayout>): Promise<UserLayout | undefined>;
  deleteUserLayout(id: number): Promise<void>;
  
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

// In-memory implementation of the storage interface
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private documents: Map<number, Document>;
  private documentImages: Map<number, DocumentImage>;
  private messages: Map<number, Message>;
  private chats: Map<number, Chat>;
  private chatMessages: Map<number, ChatMessage>;
  private userLayouts: Map<number, UserLayout>;
  private config: Record<string, any>;
  
  private userId: number;
  private documentId: number;
  private documentImageId: number;
  private messageId: number;
  private chatId: number;
  private chatMessageId: number;
  private userLayoutId: number;
  sessionStore: session.Store;
  
  constructor() {
    this.users = new Map();
    this.documents = new Map();
    this.documentImages = new Map();
    this.messages = new Map();
    this.chats = new Map();
    this.chatMessages = new Map();
    this.userLayouts = new Map();
    this.config = {};
    
    this.userId = 1;
    this.documentId = 1;
    this.documentImageId = 1;
    this.messageId = 1;
    this.chatId = 1;
    this.chatMessageId = 1;
    this.userLayoutId = 1;
    
    // Create a memory store for sessions
    const MemoryStore = require('memorystore')(session);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      email: insertUser.email || null,
      name: insertUser.name || null,
      role: insertUser.role || "user",
      createdAt: now,
      updatedAt: now,
      lastLogin: null
    };
    this.users.set(id, user);
    return user;
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async updateUserLastLogin(id: number): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.lastLogin = new Date();
      this.users.set(id, user);
    }
  }
  
  // Chat methods
  async getChat(id: number): Promise<Chat | undefined> {
    return this.chats.get(id);
  }
  
  async getUserChats(userId: number): Promise<Chat[]> {
    return Array.from(this.chats.values())
      .filter(chat => chat.userId === userId)
      .sort((a, b) => {
        const dateA = new Date(a.updatedAt).getTime();
        const dateB = new Date(b.updatedAt).getTime();
        return dateB - dateA; // Most recent first
      });
  }
  
  async createChat(chat: InsertChat): Promise<Chat> {
    const id = this.chatId++;
    const now = new Date();
    const newChat: Chat = {
      ...chat,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.chats.set(id, newChat);
    return newChat;
  }
  
  async updateChatTitle(id: number, title: string): Promise<Chat | undefined> {
    const chat = this.chats.get(id);
    if (chat) {
      const updatedChat = {
        ...chat,
        title,
        updatedAt: new Date()
      };
      this.chats.set(id, updatedChat);
      return updatedChat;
    }
    return undefined;
  }
  
  async deleteChat(id: number): Promise<void> {
    this.chats.delete(id);
    // Also delete associated messages
    Array.from(this.chatMessages.entries())
      .filter(([_, msg]) => msg.chatId === id)
      .forEach(([msgId, _]) => this.chatMessages.delete(msgId));
  }
  
  // Chat Message methods
  async getChatMessages(chatId: number): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter(msg => msg.chatId === chatId)
      .sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB; // Oldest first
      });
  }
  
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = this.chatMessageId++;
    const now = new Date();
    const newMessage: ChatMessage = {
      ...message,
      id,
      createdAt: now,
      references: message.references || null
    };
    this.chatMessages.set(id, newMessage);
    
    // Update the parent chat's updatedAt timestamp
    const chat = this.chats.get(message.chatId);
    if (chat) {
      chat.updatedAt = now;
      this.chats.set(message.chatId, chat);
    }
    
    return newMessage;
  }
  
  // User Layout methods
  async getUserLayouts(userId: number): Promise<UserLayout[]> {
    return Array.from(this.userLayouts.values())
      .filter(layout => layout.userId === userId);
  }
  
  async getUserDefaultLayout(userId: number): Promise<UserLayout | undefined> {
    return Array.from(this.userLayouts.values())
      .find(layout => layout.userId === userId && layout.isDefault);
  }
  
  async createUserLayout(layout: InsertUserLayout): Promise<UserLayout> {
    const id = this.userLayoutId++;
    const now = new Date();
    
    // If this is the default layout, unset any existing default layout
    if (layout.isDefault) {
      Array.from(this.userLayouts.values())
        .filter(l => l.userId === layout.userId && l.isDefault)
        .forEach(l => {
          l.isDefault = false;
          this.userLayouts.set(l.id, l);
        });
    }
    
    const newLayout: UserLayout = {
      ...layout,
      id,
      createdAt: now,
      updatedAt: now,
      isDefault: layout.isDefault === undefined ? null : layout.isDefault
    };
    this.userLayouts.set(id, newLayout);
    return newLayout;
  }
  
  async updateUserLayout(id: number, layoutData: Partial<UserLayout>): Promise<UserLayout | undefined> {
    const layout = this.userLayouts.get(id);
    if (layout) {
      // If setting to default, unset any existing default layouts for this user
      if (layoutData.isDefault) {
        Array.from(this.userLayouts.values())
          .filter(l => l.userId === layout.userId && l.isDefault && l.id !== id)
          .forEach(l => {
            l.isDefault = false;
            this.userLayouts.set(l.id, l);
          });
      }
      
      const updatedLayout = {
        ...layout,
        ...layoutData,
        updatedAt: new Date()
      };
      this.userLayouts.set(id, updatedLayout);
      return updatedLayout;
    }
    return undefined;
  }
  
  async deleteUserLayout(id: number): Promise<void> {
    this.userLayouts.delete(id);
  }
  
  // Document methods (legacy but maintained for compatibility)
  async getDocument(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }
  
  async getAllDocuments(): Promise<Document[]> {
    return Array.from(this.documents.values());
  }
  
  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = this.documentId++;
    const now = new Date().toISOString();
    const document: Document = { 
      ...insertDocument, 
      id, 
      createdAt: now
    };
    this.documents.set(id, document);
    return document;
  }
  
  // Document Image methods (legacy but maintained for compatibility)
  async getDocumentImages(documentId: number): Promise<DocumentImage[]> {
    return Array.from(this.documentImages.values()).filter(
      (image) => image.documentId === documentId
    );
  }
  
  async getDocumentImage(id: number): Promise<DocumentImage | undefined> {
    return this.documentImages.get(id);
  }
  
  async createDocumentImage(insertImage: InsertDocumentImage): Promise<DocumentImage> {
    const id = this.documentImageId++;
    const image: DocumentImage = { 
      ...insertImage, 
      id,
      altText: insertImage.altText || null,
      caption: insertImage.caption || null,
      pageNumber: insertImage.pageNumber || null
    };
    this.documentImages.set(id, image);
    return image;
  }
  
  // Message methods (legacy but maintained for compatibility)
  async getMessages(documentId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((message) => message.documentId === documentId)
      .sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });
  }
  
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.messageId++;
    const now = new Date().toISOString();
    const message: Message = { 
      ...insertMessage, 
      id, 
      timestamp: now,
      references: insertMessage.references || null
    };
    this.messages.set(id, message);
    return message;
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

// Database implementation of the storage interface
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import connectPg from "connect-pg-simple";
import { Pool } from "@neondatabase/serverless";

export class DatabaseStorage implements IStorage {
  private configCache: Record<string, any> | null = null;
  sessionStore: session.Store;
  
  constructor() {
    const PostgresSessionStore = connectPg(session);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    this.sessionStore = new PostgresSessionStore({
      pool, 
      tableName: 'session',
      createTableIfMissing: true
    });
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
  
  async updateUserLastLogin(id: number): Promise<void> {
    await db.update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, id));
  }
  
  // Chat methods
  async getChat(id: number): Promise<Chat | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, id));
    return chat;
  }
  
  async getUserChats(userId: number): Promise<Chat[]> {
    return await db.select()
      .from(chats)
      .where(eq(chats.userId, userId))
      .orderBy(desc(chats.updatedAt));
  }
  
  async createChat(chat: InsertChat): Promise<Chat> {
    const [newChat] = await db.insert(chats).values(chat).returning();
    return newChat;
  }
  
  async updateChatTitle(id: number, title: string): Promise<Chat | undefined> {
    const [updatedChat] = await db.update(chats)
      .set({ 
        title, 
        updatedAt: new Date() 
      })
      .where(eq(chats.id, id))
      .returning();
    return updatedChat;
  }
  
  async deleteChat(id: number): Promise<void> {
    await db.delete(chats).where(eq(chats.id, id));
  }
  
  // Chat Message methods
  async getChatMessages(chatId: number): Promise<ChatMessage[]> {
    return await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chatId))
      .orderBy(chatMessages.createdAt);
  }
  
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    // Update the parent chat's updatedAt timestamp
    await db.update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, message.chatId));
      
    const [newMessage] = await db.insert(chatMessages).values(message).returning();
    return newMessage;
  }
  
  // User Layout methods
  async getUserLayouts(userId: number): Promise<UserLayout[]> {
    return await db.select()
      .from(userLayouts)
      .where(eq(userLayouts.userId, userId));
  }
  
  async getUserDefaultLayout(userId: number): Promise<UserLayout | undefined> {
    const [layout] = await db.select()
      .from(userLayouts)
      .where(and(
        eq(userLayouts.userId, userId),
        eq(userLayouts.isDefault, true)
      ));
    return layout;
  }
  
  async createUserLayout(layout: InsertUserLayout): Promise<UserLayout> {
    // If this is the default layout, unset any existing default layout
    if (layout.isDefault) {
      await db.update(userLayouts)
        .set({ isDefault: false })
        .where(and(
          eq(userLayouts.userId, layout.userId),
          eq(userLayouts.isDefault, true)
        ));
    }
    
    const [newLayout] = await db.insert(userLayouts).values(layout).returning();
    return newLayout;
  }
  
  async updateUserLayout(id: number, layoutData: Partial<UserLayout>): Promise<UserLayout | undefined> {
    // If setting to default, unset any existing default layouts for this user
    if (layoutData.isDefault) {
      const [currentLayout] = await db.select().from(userLayouts).where(eq(userLayouts.id, id));
      if (currentLayout) {
        await db.update(userLayouts)
          .set({ isDefault: false })
          .where(and(
            eq(userLayouts.userId, currentLayout.userId),
            eq(userLayouts.isDefault, true)
          ));
      }
    }
    
    const [updatedLayout] = await db.update(userLayouts)
      .set({ 
        ...layoutData, 
        updatedAt: new Date() 
      })
      .where(eq(userLayouts.id, id))
      .returning();
    
    return updatedLayout;
  }
  
  async deleteUserLayout(id: number): Promise<void> {
    await db.delete(userLayouts).where(eq(userLayouts.id, id));
  }
  
  // Document methods (legacy but maintained for compatibility)
  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }
  
  async getAllDocuments(): Promise<Document[]> {
    return await db.select().from(documents);
  }
  
  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db.insert(documents).values(document).returning();
    return newDocument;
  }
  
  // Document Image methods (legacy but maintained for compatibility)
  async getDocumentImages(documentId: number): Promise<DocumentImage[]> {
    return await db.select()
      .from(documentImages)
      .where(eq(documentImages.documentId, documentId));
  }
  
  async getDocumentImage(id: number): Promise<DocumentImage | undefined> {
    const [image] = await db.select()
      .from(documentImages)
      .where(eq(documentImages.id, id));
    return image;
  }
  
  async createDocumentImage(image: InsertDocumentImage): Promise<DocumentImage> {
    const [newImage] = await db.insert(documentImages).values(image).returning();
    return newImage;
  }
  
  // Message methods (legacy but maintained for compatibility)
  async getMessages(documentId: number): Promise<Message[]> {
    return await db.select()
      .from(messages)
      .where(eq(messages.documentId, documentId))
      .orderBy(messages.timestamp);
  }
  
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }
  
  // Configuration methods
  async getConfig(): Promise<Record<string, any>> {
    // Simple config implementation - in a real app this would be stored in DB
    if (!this.configCache) {
      this.configCache = {
        openai: {
          model: "gpt-4o",
          temperature: 0.7,
          maxTokens: 2000
        },
        diagramming: {
          defaultWidth: 800,
          defaultHeight: 600,
          preferredFormat: "png"
        }
      };
    }
    return this.configCache;
  }
  
  async saveConfig(config: Record<string, any>): Promise<Record<string, any>> {
    this.configCache = { ...config };
    return this.configCache;
  }
}

// Create and export a singleton instance
export const storage = new DatabaseStorage();
