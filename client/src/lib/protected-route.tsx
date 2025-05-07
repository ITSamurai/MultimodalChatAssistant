import React from 'react';
import { Route, Redirect } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

// Simple protected route that redirects to login if not authenticated
export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  return (
    <Route path={path}>
      {() => <ProtectedComponent Component={Component} />}
    </Route>
  );
}

// Separate component to handle auth logic
function ProtectedComponent({ Component }: { Component: React.ComponentType<any> }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return <Component />;
}