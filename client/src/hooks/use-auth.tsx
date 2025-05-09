import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// Define user interface that matches the schema on the server
interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  lastLogin: Date | null;
  createdAt: Date;
}

// Context type to share auth state across app
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: any; // Using any to simplify for now
  logoutMutation: any;
  registerMutation: any;
}

// Create the auth context
const AuthContext = createContext<AuthContextType | null>(null);

// Auth provider component that wraps the app
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  
  // Fetch current user data
  const {
    data: user,
    error,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['/api/user'],
    queryFn: async () => {
      try {
        console.log('Fetching user data, auth token exists:', Boolean(localStorage.getItem('authToken')));
        const response = await apiRequest('GET', '/api/user');
        
        if (response.status === 401) {
          console.log('User not authenticated');
          // Clear any stale token from localStorage
          if (localStorage.getItem('authToken')) {
            localStorage.removeItem('authToken');
          }
          return null;
        }
        
        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }
        
        const userData = await response.json();
        console.log('User data fetched successfully:', {
          id: userData.id,
          username: userData.username,
          role: userData.role,
          roleType: typeof userData.role
        });
        
        // Ensure the role is properly set
        if (!userData.role) {
          console.warn('User data is missing role property');
        }
        
        return userData;
      } catch (error) {
        console.error('Error fetching user:', error);
        return null;
      }
    },
    retry: 1, // Only retry once to avoid too many failed requests
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });
  
  // Check for and store auth token from response headers
  useEffect(() => {
    const checkResponseForToken = async () => {
      try {
        // Make a test request to the API to see if we get a token
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        
        // Look for the token in the authorization header
        const authHeader = response.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          localStorage.setItem('authToken', token);
          console.log('Stored new auth token');
          
          // Refresh user data after getting a new token
          refetch();
        }
      } catch (error) {
        console.error('Error during token refresh:', error);
      }
    };
    
    // Only try to refresh if we don't have user data yet
    if (!user && !isLoading) {
      checkResponseForToken();
    }
  }, [user, isLoading, refetch]);
  
  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const response = await apiRequest('POST', '/api/login', credentials);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Login failed');
      }
      
      // Look for the token in the authorization header
      const authHeader = response.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        console.log('Storing auth token from login response');
        localStorage.setItem('authToken', token);
      } else {
        console.warn('No authorization header with token in login response');
      }
      
      const userData = await response.json();
      console.log('Login response data:', {
        id: userData.id,
        username: userData.username,
        role: userData.role,
        hasToken: Boolean(userData.token)
      });
      
      // Store token from response body as fallback
      if (userData.token && !authHeader) {
        console.log('Storing token from response body');
        localStorage.setItem('authToken', userData.token);
      }
      
      return userData;
    },
    onSuccess: (userData: User) => {
      console.log('Login successful, storing user data in cache:', {
        id: userData.id,
        username: userData.username,
        role: userData.role
      });
      
      // Update the cached user data
      queryClient.setQueryData(['/api/user'], userData);
      
      toast({
        title: 'Login Successful',
        description: `Welcome back, ${userData.username}!`,
      });
    },
    onError: (error: Error) => {
      console.error('Login error:', error);
      toast({
        title: 'Login Failed',
        description: error.message || 'Invalid username or password',
        variant: 'destructive',
      });
    },
  });
  
  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/logout');
      
      // Remove the token regardless of response
      localStorage.removeItem('authToken');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Logout failed');
      }
      
      return await response.json().catch(() => ({}));
    },
    onSuccess: () => {
      // Clear the cached user data
      queryClient.setQueryData(['/api/user'], null);
      
      // Invalidate all queries to force refetch after login
      queryClient.invalidateQueries();
      
      toast({
        title: 'Logged Out',
        description: 'You have been successfully logged out',
      });
    },
    onError: (error: Error) => {
      console.error('Logout error:', error);
      toast({
        title: 'Logout Failed',
        description: error.message || 'Failed to log out',
        variant: 'destructive',
      });
    },
  });
  
  // Register mutation
  const registerMutation = useMutation({
    mutationFn: async (userData: { username: string; password: string; email: string; role?: string }) => {
      const response = await apiRequest('POST', '/api/register', userData);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Registration failed');
      }
      
      // Look for the token in the authorization header
      const authHeader = response.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        localStorage.setItem('authToken', token);
      }
      
      return await response.json();
    },
    onSuccess: (userData: User) => {
      // Update the cached user data
      queryClient.setQueryData(['/api/user'], userData);
      
      toast({
        title: 'Registration Successful',
        description: `Welcome, ${userData.username}!`,
      });
    },
    onError: (error: Error) => {
      console.error('Registration error:', error);
      toast({
        title: 'Registration Failed',
        description: error.message || 'Failed to create account',
        variant: 'destructive',
      });
    },
  });
  
  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error: error as Error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}