import { useState } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const { user, loginMutation } = useAuth();

  // Redirect if already logged in
  if (user) {
    return <Redirect to="/" />;
  }

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    loginMutation.mutate({
      username: formData.get("username") as string,
      password: formData.get("password") as string,
    });
  };

  return (
    <div className="container flex h-screen items-center justify-center">
      <div className="flex flex-col md:flex-row w-full max-w-5xl space-y-6 md:space-y-0 md:space-x-6">
        {/* Left side - Auth form */}
        <div className="flex-1">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <h2 className="text-2xl font-bold text-primary">RiverMeadow</h2>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">RiverMeadow AI Chat</h1>
            <p className="text-muted-foreground mt-2">Sign in to access the intelligent assistant</p>
          </div>
          
          <Card>
            <form onSubmit={handleLogin}>
              <CardHeader>
                <CardTitle>Login</CardTitle>
                <CardDescription>
                  Enter your credentials to access your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input 
                    id="username" 
                    name="username" 
                    placeholder="Username" 
                    required 
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password" 
                    name="password" 
                    type="password" 
                    placeholder="Password" 
                    required 
                    autoComplete="current-password"
                  />
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  <p>Default credentials: scott / tiger</p>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Sign In
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
        
        {/* Right side - Hero section */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="space-y-4 p-6 bg-muted rounded-lg">
            <h2 className="text-2xl font-bold">Intelligent Knowledge Assistant</h2>
            <p className="text-muted-foreground">
              Leverage advanced AI to get insights from the RiverMeadow knowledge base. Ask questions and get accurate, 
              context-aware responses powered by the latest language models.
            </p>
            <ul className="space-y-2">
              <li className="flex items-center">
                <div className="mr-2 h-4 w-4 rounded-full bg-primary"></div>
                <span>Instant answers from the knowledge base</span>
              </li>
              <li className="flex items-center">
                <div className="mr-2 h-4 w-4 rounded-full bg-primary"></div>
                <span>Smart context understanding</span>
              </li>
              <li className="flex items-center">
                <div className="mr-2 h-4 w-4 rounded-full bg-primary"></div>
                <span>Powered by OpenAI GPT-4o</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}