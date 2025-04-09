import { useState } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [activeTab, setActiveTab] = useState("login");

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
    registerMutation.mutate({
      username: formData.get("username") as string,
      password: formData.get("password") as string,
      name: formData.get("name") as string,
      email: formData.get("email") as string,
    });
  };

  return (
    <div className="container flex h-screen items-center justify-center">
      <div className="flex flex-col md:flex-row w-full max-w-5xl space-y-6 md:space-y-0 md:space-x-6">
        {/* Left side - Auth forms */}
        <div className="flex-1">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img 
                src="/images/rivermeadow-logo.png" 
                alt="RiverMeadow" 
                className="h-12"
              />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">RiverMeadow AI Chat</h1>
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
                      <Label htmlFor="username">Username</Label>
                      <Input 
                        id="username" 
                        name="username" 
                        placeholder="Username" 
                        required 
                        autoComplete="username"
                        defaultValue="scott"
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
                        defaultValue="tiger"
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
                    <CardTitle>Create an account</CardTitle>
                    <CardDescription>
                      Enter your information to create a new account
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-name">Name</Label>
                      <Input id="register-name" name="name" placeholder="Full name" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input id="register-email" name="email" type="email" placeholder="email@example.com" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-username">Username</Label>
                      <Input id="register-username" name="username" placeholder="Username" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input id="register-password" name="password" type="password" placeholder="Password" required />
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
            <h2 className="text-2xl font-bold">Intelligent Document Assistant</h2>
            <p className="text-muted-foreground">
              Leverage advanced AI to get insights from your documents and knowledge base. Ask questions and get accurate, 
              context-aware responses powered by the latest language models.
            </p>
            <ul className="space-y-2">
              <li className="flex items-center">
                <div className="mr-2 h-4 w-4 rounded-full bg-primary"></div>
                <span>Instant answers from your documents</span>
              </li>
              <li className="flex items-center">
                <div className="mr-2 h-4 w-4 rounded-full bg-primary"></div>
                <span>Smart image and text understanding</span>
              </li>
              <li className="flex items-center">
                <div className="mr-2 h-4 w-4 rounded-full bg-primary"></div>
                <span>Access to extensive knowledge base</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}