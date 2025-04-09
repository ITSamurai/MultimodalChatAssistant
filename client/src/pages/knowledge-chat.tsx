import { KnowledgeBaseChat } from "../components/KnowledgeBaseChat";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Layout } from "@/components/Layout";

export default function KnowledgeChatPage() {
  return (
    <Layout>
      {/* Main Content */}
      <div className="container py-6">
        <div className="max-w-5xl mx-auto">
          <Card className="mb-4 shadow-sm">
            <CardHeader>
              <CardTitle>RiverMeadow AI Knowledge Base</CardTitle>
              <CardDescription>
                Ask questions about RiverMeadow's products and services. The AI assistant will use the knowledge base to provide accurate answers.
              </CardDescription>
            </CardHeader>
          </Card>
          
          {/* Chat Interface */}
          <div className="border rounded-lg overflow-hidden h-[calc(100vh-220px)] shadow-sm">
            <KnowledgeBaseChat />
          </div>
        </div>
      </div>
    </Layout>
  );
}