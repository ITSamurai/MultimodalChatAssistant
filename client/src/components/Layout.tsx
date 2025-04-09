import { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { useAuth } from "@/hooks/use-auth";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      {user && <Navbar />}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
};