import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import KnowledgeChatPage from "@/pages/knowledge-chat";
import ChatPage from "@/pages/chat-page";
import ConfigPage from "@/pages/config-page";
import AuthPage from "@/pages/auth-page";
import AdminPage from "@/pages/admin-page";
import { AuthProvider } from "@/hooks/use-auth";
import { ChatTitlesProvider } from "@/hooks/use-chat-titles"; 
import { ProtectedRoute } from "@/lib/protected-route";

function Router() {
  const [location] = useLocation();
  
  // Add debug logging
  console.log("Current location:", location);
  
  return (
    <Switch>
      <ProtectedRoute path="/" component={() => <ChatPage />} />
      <ProtectedRoute path="/chat" component={() => <ChatPage />} />
      <ProtectedRoute path="/chat/:id" component={ChatPage} />
      <ProtectedRoute path="/knowledge" component={() => <KnowledgeChatPage />} />
      <ProtectedRoute path="/config" component={() => <ConfigPage />} />
      <ProtectedRoute path="/admin" component={() => <AdminPage />} />
      <Route path="/auth" component={() => <AuthPage />} />
      <Route component={() => {
        console.log("Not found route triggered for path:", location);
        return <NotFound />;
      }} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ChatTitlesProvider>
          <div className="min-h-screen app-gradient-bg">
            <Router />
            <Toaster />
          </div>
        </ChatTitlesProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
