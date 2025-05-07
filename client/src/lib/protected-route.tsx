import React from 'react';
import { Route, Redirect, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  
  // Use route component as a wrapper
  return (
    <Route path={path}>
      {() => {
        if (isLoading) {
          // Show loading indicator while checking authentication
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }
        
        if (!user) {
          // Redirect to login if not authenticated
          console.log(`User not authenticated, redirecting from ${location} to /auth`);
          return <Redirect to="/auth" />;
        }
        
        // User is authenticated, render the component
        return <Component />;
      }}
    </Route>
  );
}