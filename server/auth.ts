import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import MemoryStore from "memorystore";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

// Add a token-based auth mechanism with persistence
interface TokenData {
  userId: number;
  expiresAt: number;
}

// Store tokens in memory but with persistence capabilities
const authTokens = new Map<string, TokenData>(); // token -> { userId, expiresAt }

// Token expiration time (7 days in milliseconds)
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000;

// Generate a new auth token for a user
function generateAuthToken(userId: number): string {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TOKEN_EXPIRY;
  
  authTokens.set(token, { userId, expiresAt });
  
  // Save tokens to storage for persistence
  saveTokensToStorage();
  
  return token;
}

// Verify an auth token
export async function verifyAuthToken(token: string): Promise<SelectUser | null> {
  const tokenData = authTokens.get(token);
  if (!tokenData) return null;
  
  // Check if token is expired
  if (tokenData.expiresAt < Date.now()) {
    // Token expired, remove it
    authTokens.delete(token);
    saveTokensToStorage();
    return null;
  }
  
  // Refresh token expiration on use
  tokenData.expiresAt = Date.now() + TOKEN_EXPIRY;
  authTokens.set(token, tokenData);
  saveTokensToStorage();
  
  return await storage.getUser(tokenData.userId) || null;
}

// Helper to persist tokens
function saveTokensToStorage() {
  try {
    // Convert Map to a serializable object
    const tokens: Record<string, TokenData> = {};
    authTokens.forEach((data, token) => {
      tokens[token] = data;
    });
    
    // Store in storage
    storage.saveConfig({ auth_tokens: tokens });
  } catch (error) {
    console.error('Error saving auth tokens:', error);
  }
}

// Load tokens from storage
async function loadTokensFromStorage() {
  try {
    const config = await storage.getConfig();
    const tokens = config.auth_tokens || {};
    
    // Clear existing tokens
    authTokens.clear();
    
    // Add tokens from storage
    Object.entries(tokens).forEach(([token, data]) => {
      const tokenData = data as TokenData;
      if (tokenData.expiresAt > Date.now()) {
        // Only load non-expired tokens
        authTokens.set(token, tokenData);
      }
    });
    
    console.log(`Loaded ${authTokens.size} valid auth tokens from storage`);
  } catch (error) {
    console.error('Error loading auth tokens:', error);
  }
}

// Token authentication middleware
function tokenAuth(req: Request, res: Response, next: NextFunction) {
  // Check for token in Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // No token, proceed to next auth method
  }

  const token = authHeader.split(' ')[1];
  
  // Store token in request for later use
  (req as any).authToken = token;
  
  next();
}

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Create a middleware for token-based authentication
export async function requireTokenAuth(req: Request, res: Response, next: NextFunction) {
  // Check for auth token in request headers
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  
  // Verify token and get user
  const user = await verifyAuthToken(token);
  if (!user) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  
  // Set user in request
  req.user = user;
  
  next();
}

export async function setupAuth(app: Express) {
  // Load auth tokens from storage
  await loadTokensFromStorage();
  
  const MemStore = MemoryStore(session);
  
  const sessionSettings: session.SessionOptions = {
    secret: "rivermeadow-secret-key",
    resave: false,
    saveUninitialized: false,
    store: new MemStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "none", // Allow cross-site cookies (for vertical-assistant.com)
      domain: process.env.COOKIE_DOMAIN || undefined // Use explicit domain if provided
    }
  };

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        
        // For the hardcoded user (scott/tiger)
        if (username === "scott" && password === "tiger") {
          // If the user doesn't exist yet, create it
          if (!user) {
            const newUser = await storage.createUser({
              username: "scott",
              password: await hashPassword("tiger"),
              email: "scott@rivermeadow.com",
              name: "Scott Admin",
              role: "superadmin"
            });
            return done(null, newUser);
          }
          return done(null, user);
        }
        
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Public registration removed - users can only be created through the admin panel now

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: any, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      req.login(user, (err) => {
        if (err) {
          return next(err);
        }
        
        // Generate token for API access
        const token = generateAuthToken(user.id);
        
        // Return user data with token
        return res.status(200).json({
          ...user,
          token: token
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", async (req, res) => {
    try {
      // First check for token-based authentication
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const user = await verifyAuthToken(token);
        
        if (user) {
          return res.json(user);
        }
      }
      
      // Fall back to session-based authentication
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      res.json(req.user);
    } catch (error) {
      console.error('User authentication error:', error);
      res.status(500).json({ message: 'Authentication error' });
    }
  });
}