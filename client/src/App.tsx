import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import KnowledgeChatPage from "@/pages/knowledge-chat";
import ConfigPage from "@/pages/config-page";
import AuthPage from "@/pages/auth-page";
import ChatListPage from "@/pages/chat-list-page";
import ChatPage from "@/pages/chat-page";
import DiagramTestPage from "@/pages/diagram-test-page";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={ChatListPage} />
      <ProtectedRoute path="/chat/:id" component={ChatPage} />
      <ProtectedRoute path="/knowledge-chat" component={KnowledgeChatPage} />
      <ProtectedRoute path="/config" component={ConfigPage} />
      <ProtectedRoute path="/diagram-test" component={DiagramTestPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
