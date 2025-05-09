import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Navbar = () => {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  
  // Debug log to see what's happening with the user
  const isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');
  console.log("Current user in Navbar:", user ? {
    id: user.id,
    username: user.username,
    role: user.role,
    isAdmin: isAdmin
  } : null);

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
            <Link href="/config">
              <Button 
                variant="ghost"
                className={location === "/config" ? "bg-accent" : ""}
              >
                Settings
              </Button>
            </Link>
            {(() => {
              // Debug user role
              console.log("Checking admin access: ", {
                hasRole: Boolean(user.role),
                role: user.role,
                isAdmin: user.role === 'admin',
                isSuperAdmin: user.role === 'superadmin',
                shouldShowAdminButton: user.role === 'superadmin' || user.role === 'admin'
              });
              return null; // Return null so nothing is rendered
            })()}
            
            {(user.role === 'superadmin' || user.role === 'admin') && (
              <Link href="/admin">
                <Button 
                  variant="ghost"
                  className={location === "/admin" ? "bg-accent" : ""}
                >
                  Admin
                </Button>
              </Link>
            )}
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