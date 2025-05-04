import { useState } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("login");

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
  
  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    
    if (password !== confirmPassword) {
      alert("Passwords don't match");
      return;
    }
    
    registerMutation.mutate({
      username: formData.get("username") as string,
      password: password,
      role: "user", // Default role for new users
      name: formData.get("name") as string || "",
      // Note: last_login is updated automatically by the server
    });
  };

  return (
    <div className="container flex h-screen items-center justify-center">
      <div className="flex flex-col md:flex-row w-full max-w-5xl space-y-6 md:space-y-0 md:space-x-6">
        {/* Left side - Auth form */}
        <div className="flex-1">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-primary">RiverMeadow AI Chat</h1>
            <p className="text-muted-foreground mt-2">Sign in to access the intelligent assistant</p>
          </div>
          
          <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
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
                      <Label htmlFor="login-username">Username</Label>
                      <Input 
                        id="login-username" 
                        name="username" 
                        placeholder="Username" 
                        required 
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input 
                        id="login-password" 
                        name="password" 
                        type="password" 
                        placeholder="Password" 
                        required 
                        autoComplete="current-password"
                      />
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
            </TabsContent>
            
            <TabsContent value="register">
              <Card>
                <form onSubmit={handleRegister}>
                  <CardHeader>
                    <CardTitle>Register</CardTitle>
                    <CardDescription>
                      Create a new account to access the platform
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-name">Name</Label>
                      <Input 
                        id="register-name" 
                        name="name" 
                        placeholder="Your name" 
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-username">Username</Label>
                      <Input 
                        id="register-username" 
                        name="username" 
                        placeholder="Choose a username" 
                        required 
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input 
                        id="register-password" 
                        name="password" 
                        type="password" 
                        placeholder="Choose a password" 
                        required 
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-confirm-password">Confirm Password</Label>
                      <Input 
                        id="register-confirm-password" 
                        name="confirmPassword" 
                        type="password" 
                        placeholder="Confirm your password" 
                        required 
                        autoComplete="new-password"
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Create Account
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>
          </Tabs>
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
                <span>Intelligent diagram generation</span>
              </li>
              <li className="flex items-center">
                <div className="mr-2 h-4 w-4 rounded-full bg-primary"></div>
                <span>Multiple chats with history</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}