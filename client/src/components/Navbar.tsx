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
            <h2 className="text-xl font-bold text-primary">RiverMeadow AI Chat</h2>
          </Link>
        </div>
        
        {user && (
          <div className="flex items-center gap-4">
            <Link href="/diagram-test">
              <Button 
                variant="ghost"
                className={location === "/diagram-test" ? "bg-accent" : ""}
              >
                Diagram Test
              </Button>
            </Link>
            <Link href="/config">
              <Button 
                variant="ghost"
                className={location === "/config" ? "bg-accent" : ""}
              >
                Settings
              </Button>
            </Link>
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