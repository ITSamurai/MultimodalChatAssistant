import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import MemoryStore from "memorystore";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

// Add a simple token-based auth mechanism
const authTokens = new Map<string, number>(); // token -> userId

// Generate a new auth token for a user
function generateAuthToken(userId: number): string {
  const token = randomBytes(32).toString('hex');
  authTokens.set(token, userId);
  return token;
}

// Verify an auth token
export async function verifyAuthToken(token: string): Promise<SelectUser | null> {
  const userId = authTokens.get(token);
  if (!userId) return null;
  
  return await storage.getUser(userId) || null;
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

export function setupAuth(app: Express) {
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

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

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