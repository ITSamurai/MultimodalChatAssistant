import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getFullUrl } from "./config";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Token management with automatic renewal
const TOKEN_KEY = 'auth_token';
const TOKEN_EXPIRY_KEY = 'auth_token_expiry';
const USER_ID_KEY = 'auth_user_id';

// Get the auth token from local storage with auto-refresh check
function getAuthToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
  
  if (!token) return null;
  
  // If we have an expiry date, check if token is about to expire
  if (expiryStr) {
    const expiry = parseInt(expiryStr, 10);
    const now = Date.now();
    
    // If token is about to expire (less than 1 hour remaining), trigger refresh
    if (expiry - now < 60 * 60 * 1000) {
      // Automatic token refresh
      refreshToken().catch(err => {
        console.error('Error refreshing token:', err);
      });
    }
  }
  
  return token;
}

// Function to refresh token
async function refreshToken(): Promise<void> {
  try {
    // We need a valid token to refresh, if none exists, we can't refresh
    const currentToken = localStorage.getItem(TOKEN_KEY);
    const userId = localStorage.getItem(USER_ID_KEY);
    
    if (!currentToken || !userId) {
      // Clear invalid state
      clearAuthData();
      return;
    }
    
    // Request a new token by sending the current token
    // Create fresh headers without using the token (to avoid recursive calls)
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${currentToken}`
    };
    
    // Make sure we're using the correct domain
    const fullUrl = getFullUrl('/api/user');
    
    // Just verify the current token works by getting the user info
    // If it works, we keep using it
    const res = await fetch(fullUrl, {
      method: 'GET',
      headers,
      credentials: 'include',
    });
    
    if (res.status === 401) {
      // If token is invalid, clear auth data
      clearAuthData();
      return;
    }
    
    // If the token is valid, we're good to go
    return;
  } catch (error) {
    console.error('Token refresh failed:', error);
    // Don't clear auth data on network errors, as they may be temporary
    return;
  }
}

// Helper to store auth data consistently
function setAuthData(token: string, userId: number): void {
  // Calculate expiry (7 days from now)
  const expiry = Date.now() + (7 * 24 * 60 * 60 * 1000);
  
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiry.toString());
  localStorage.setItem(USER_ID_KEY, userId.toString());
}

// Helper to clear auth data
function clearAuthData(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Create headers object
  const headers: Record<string, string> = {};
  
  // Add Content-Type header for requests with body
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add Authorization header if token exists
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  // Make sure we're using the correct domain
  const fullUrl = getFullUrl(url);
  
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Create headers object
    const headers: Record<string, string> = {};
    
    // Add Authorization header if token exists
    const token = getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    // Ensure we're using the correct domain
    const fullUrl = getFullUrl(queryKey[0] as string);
    
    const res = await fetch(fullUrl, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
