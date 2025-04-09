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
            <h2 className="text-xl font-bold text-primary">RiverMeadow</h2>
          </Link>
          
          {user && (
            <nav className="flex items-center gap-4 md:gap-6 text-sm font-medium">
              <span className="text-primary font-medium">
                RiverMeadow AI Chat
              </span>
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