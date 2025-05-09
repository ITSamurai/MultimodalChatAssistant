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
  lastAccessed?: number; // Track when token was last used
  deviceInfo?: string; // Store device/browser info
  ipAddress?: string; // Store IP for additional security
}

// Store tokens in memory but with persistence capabilities
const authTokens = new Map<string, TokenData>(); // token -> { userId, expiresAt, ... }

// Token expiration time (14 days in milliseconds) - extended for better UX
const TOKEN_EXPIRY = 14 * 24 * 60 * 60 * 1000;

// Generate a new auth token for a user
function generateAuthToken(userId: number, req?: Request): string {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TOKEN_EXPIRY;
  const now = Date.now();
  
  // Get device info from request if available
  const userAgent = req?.headers?.['user-agent'] || 'Unknown';
  const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || 'Unknown';
  
  // Store token with additional metadata
  authTokens.set(token, { 
    userId, 
    expiresAt,
    lastAccessed: now,
    deviceInfo: userAgent,
    ipAddress: typeof ipAddress === 'string' ? ipAddress : 'Unknown'
  });
  
  // Save tokens to storage for persistence
  saveTokensToStorage();
  
  console.log(`Generated new token for user ${userId}, expires in ${TOKEN_EXPIRY / (24 * 60 * 60 * 1000)} days`);
  
  return token;
}

// Verify an auth token
export async function verifyAuthToken(token: string, req?: Request): Promise<SelectUser | null> {
  const tokenData = authTokens.get(token);
  if (!tokenData) {
    console.log('Token not found in authTokens map');
    return null;
  }
  
  // Check if token is expired
  if (tokenData.expiresAt < Date.now()) {
    console.log(`Token expired at ${new Date(tokenData.expiresAt).toISOString()}`);
    // Token expired, remove it
    authTokens.delete(token);
    saveTokensToStorage();
    return null;
  }
  
  // Update metadata
  const now = Date.now();
  
  // Refresh token expiration on use and update metadata
  tokenData.expiresAt = now + TOKEN_EXPIRY;
  tokenData.lastAccessed = now;
  
  // Update IP and device info if request is available
  if (req) {
    const userAgent = req.headers?.['user-agent'];
    const ipAddress = req.ip || req.headers?.['x-forwarded-for'];
    
    if (userAgent) tokenData.deviceInfo = userAgent;
    if (ipAddress) tokenData.ipAddress = typeof ipAddress === 'string' ? ipAddress : 'Unknown';
  }
  
  // Save updated token data
  authTokens.set(token, tokenData);
  saveTokensToStorage();
  
  // Get user data
  const user = await storage.getUser(tokenData.userId);
  return user || null;
}

// Helper to persist tokens
function saveTokensToStorage() {
  try {
    // Convert Map to a serializable object
    const tokens: Record<string, TokenData> = {};
    authTokens.forEach((data, token) => {
      tokens[token] = data;
    });
    
    console.log(`Saving ${authTokens.size} tokens to storage`);
    
    // Store in storage
    storage.saveConfig({ auth_tokens: tokens })
      .then(() => {
        console.log('Auth tokens saved successfully');
      })
      .catch(err => {
        console.error('Error in saving tokens promise:', err);
      });
  } catch (error) {
    console.error('Error saving auth tokens:', error);
  }
}

// Load tokens from storage
async function loadTokensFromStorage() {
  try {
    const config = await storage.getConfig();
    console.log('Loaded config:', Object.keys(config));
    
    const tokens = config.auth_tokens || {};
    console.log(`Found ${Object.keys(tokens).length} tokens in storage`);
    
    // Clear existing tokens
    authTokens.clear();
    
    // Add tokens from storage
    Object.entries(tokens).forEach(([token, data]) => {
      const tokenData = data as TokenData;
      
      if (!tokenData) {
        console.warn(`Invalid token data for token: ${token.substring(0, 10)}...`);
        return;
      }
      
      if (tokenData.expiresAt > Date.now()) {
        // Only load non-expired tokens
        authTokens.set(token, tokenData);
        console.log(`Loaded token for user ${tokenData.userId}, expires: ${new Date(tokenData.expiresAt).toISOString()}`);
      } else {
        console.log(`Skipping expired token for user ${tokenData.userId}, expired: ${new Date(tokenData.expiresAt).toISOString()}`);
      }
    });
    
    console.log(`Loaded ${authTokens.size} valid auth tokens from storage`);
    
    // For debugging, show what's in the authTokens map
    if (authTokens.size > 0) {
      console.log('Auth tokens loaded:');
      authTokens.forEach((data, token) => {
        console.log(`- Token ${token.substring(0, 10)}... for user ${data.userId}, expires: ${new Date(data.expiresAt).toISOString()}`);
      });
    }
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
  
  // Verify token and get user - pass the request object for better metadata tracking
  const user = await verifyAuthToken(token, req);
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

  // Public registration endpoint
  app.post("/api/register", async (req, res, next) => {
    try {
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      
      // Hash the password
      const hashedPassword = await hashPassword(req.body.password);
      
      // Create the user with default role 'user'
      const user = await storage.createUser({
        username: req.body.username,
        password: hashedPassword,
        email: req.body.email || '',
        role: 'user' // Default role is 'user', admin roles can only be set by admins
      });
      
      // Log in the user
      req.login(user, (err) => {
        if (err) return next(err);
        
        // Generate token for API access
        const token = generateAuthToken(user.id, req);
        
        // Set token in Authorization header
        res.setHeader('Authorization', `Bearer ${token}`);
        
        // Return user data with token
        const responseData = {
          ...user,
          token: token
        };
        
        console.log('User registered and logged in:', {
          id: user.id,
          username: user.username,
          role: user.role
        });
        
        return res.status(201).json(responseData);
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: any, info: any) => {
      if (err) {
        console.error('Authentication error:', err);
        return next(err);
      }
      if (!user) {
        console.log('Login failed: Invalid credentials');
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      // Debug user object before login
      console.log('User object before login:', {
        id: user.id,
        username: user.username,
        role: user.role, 
        roleType: typeof user.role
      });
      
      req.login(user, (err) => {
        if (err) {
          console.error('Session login error:', err);
          return next(err);
        }
        
        // Generate token for API access - pass request for device tracking
        const token = generateAuthToken(user.id, req);
        console.log(`Generated token for user ${user.id} (${user.username}), role: ${user.role}`);
        
        // Set token in Authorization header
        res.setHeader('Authorization', `Bearer ${token}`);
        
        // Return user data with token
        const responseData = {
          ...user,
          token: token
        };
        
        console.log('Sending login response with user data:', {
          id: responseData.id,
          username: responseData.username,
          role: responseData.role
        });
        
        return res.status(200).json(responseData);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  // Token refresh endpoint
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      // Check for existing token
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const user = await verifyAuthToken(token, req);
        
        if (user) {
          // Generate a fresh token
          const newToken = generateAuthToken(user.id, req);
          
          // Set the new token in Authorization header
          res.setHeader('Authorization', `Bearer ${newToken}`);
          
          return res.status(200).json({ 
            success: true, 
            message: 'Token refreshed successfully' 
          });
        }
      }
      
      // No valid token found
      return res.status(200).json({ 
        success: false, 
        message: 'No valid token to refresh' 
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  });

  app.get("/api/user", async (req, res) => {
    try {
      // First check for token-based authentication
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        console.log('Verifying token auth for /api/user');
        const user = await verifyAuthToken(token, req);
        
        if (user) {
          console.log('Token auth successful for user:', {
            id: user.id,
            username: user.username,
            role: user.role
          });
          
          // Set token in Authorization header to ensure client always has fresh token
          const newToken = generateAuthToken(user.id, req);
          res.setHeader('Authorization', `Bearer ${newToken}`);
          
          return res.json(user);
        } else {
          console.log('Token auth failed: user not found');
        }
      } else {
        console.log('No authorization header found for token auth');
      }
      
      // Fall back to session-based authentication
      if (!req.isAuthenticated()) {
        console.log('Session auth failed: user not authenticated');
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      console.log('Session auth successful for user:', {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      });
      
      res.json(req.user);
    } catch (error) {
      console.error('User authentication error:', error);
      res.status(500).json({ message: 'Authentication error' });
    }
  });
}