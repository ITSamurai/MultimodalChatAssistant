import { 
  InsertUser, User, 
  InsertDocument, Document, 
  InsertDocumentImage, DocumentImage,
  InsertMessage, Message,
  documents,
  documentImages,
  messages,
  users
} from "@shared/schema";

// Interface for storage operations
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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
}

// In-memory implementation of the storage interface
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private documents: Map<number, Document>;
  private documentImages: Map<number, DocumentImage>;
  private messages: Map<number, Message>;
  
  private userId: number;
  private documentId: number;
  private documentImageId: number;
  private messageId: number;
  
  constructor() {
    this.users = new Map();
    this.documents = new Map();
    this.documentImages = new Map();
    this.messages = new Map();
    
    this.userId = 1;
    this.documentId = 1;
    this.documentImageId = 1;
    this.messageId = 1;
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
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Document methods
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
  
  // Document Image methods
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
    const image: DocumentImage = { ...insertImage, id };
    this.documentImages.set(id, image);
    return image;
  }
  
  // Message methods
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
      timestamp: now
    };
    this.messages.set(id, message);
    return message;
  }
}

// Create and export a singleton instance
export const storage = new MemStorage();
