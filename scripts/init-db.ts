import { db } from "../server/db";
import { users, chats, chatMessages, userLayouts } from "../shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Required for Neon serverless
neonConfig.webSocketConstructor = ws;

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  console.log("Creating database tables...");
  
  console.log("Creating superadmin user (scott)...");
  const hashedPassword = await hashPassword("tiger");
  
  try {
    // Create superadmin user (scott)
    const [admin] = await db.insert(users).values({
      username: "scott",
      password: hashedPassword,
      email: "scott@example.com",
      name: "Scott (Superadmin)",
      isAdmin: true,
      createdAt: new Date(),
    }).returning();
    
    console.log(`Created admin user with ID: ${admin.id}`);
    
    // Create a default welcome chat
    const [welcomeChat] = await db.insert(chats).values({
      userId: admin.id,
      title: "Welcome to RiverMeadow Assistant",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    
    console.log(`Created welcome chat with ID: ${welcomeChat.id}`);
    
    // Add a welcome message to the chat
    await db.insert(chatMessages).values({
      chatId: welcomeChat.id,
      content: "Welcome to the RiverMeadow Assistant! I'm here to help you with document analysis, diagram generation, and understanding technical documentation. How can I assist you today?",
      role: "assistant",
      timestamp: new Date(),
    });
    
    // Create a default layout for the admin user
    await db.insert(userLayouts).values({
      userId: admin.id,
      layout: {
        chatWidth: 70,  // percentage of screen width
        fontSize: "medium",
        theme: "light",
        diagramZoomDefault: 1.0,
      },
      name: "Default Layout",
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    console.log("Database initialization completed successfully!");
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log("All done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });