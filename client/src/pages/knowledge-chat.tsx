import { KnowledgeBaseChat } from "../components/KnowledgeBaseChat";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "wouter";

export default function KnowledgeChatPage() {
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-accent text-2xl">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </span>
            <h1 className="text-xl font-semibold">RiverMeadow AI Chat</h1>
          </div>

          {/* Navigation Menu */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center px-3 py-2 text-sm font-medium text-primary rounded-md bg-primary-foreground/20 hover:bg-primary-foreground/30 mr-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Back to Document Chat
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden p-4">
        <div className="w-full max-w-5xl mx-auto">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>AI Knowledge Assistant</CardTitle>
              <CardDescription>
                Ask questions about RiverMeadow's products and services. The AI assistant will use the knowledge base to provide accurate answers.
              </CardDescription>
            </CardHeader>
          </Card>
          
          {/* Chat Interface */}
          <div className="border rounded-lg overflow-hidden h-[calc(100vh-250px)]">
            <KnowledgeBaseChat />
          </div>
        </div>
      </div>
    </div>
  );
}