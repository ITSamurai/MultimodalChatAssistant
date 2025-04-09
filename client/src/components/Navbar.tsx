import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Navbar = () => {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <header className="border-b">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/images/rivermeadow-logo.png"
              alt="RiverMeadow"
              className="h-8"
            />
          </Link>
          
          {user && (
            <nav className="flex items-center gap-4 md:gap-6 text-sm font-medium">
              <Link href="/">
                <span className={`transition-colors hover:text-primary ${location === "/" ? "text-primary" : "text-muted-foreground"}`}>
                  Documents
                </span>
              </Link>
              <Link href="/knowledge-chat">
                <span className={`transition-colors hover:text-primary ${location === "/knowledge-chat" ? "text-primary" : "text-muted-foreground"}`}>
                  RiverMeadow AI Chat
                </span>
              </Link>
            </nav>
          )}
        </div>
        
        {user && (
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={handleLogout} 
              disabled={logoutMutation.isPending}
            >
              Logout
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};