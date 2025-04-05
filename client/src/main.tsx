import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Check for OpenAI API key
if (!import.meta.env.VITE_OPENAI_API_KEY && process.env.NODE_ENV !== "production") {
  console.warn(
    "Warning: VITE_OPENAI_API_KEY is not set. " +
    "Please ensure you have set the OPENAI_API_KEY environment variable."
  );
}

createRoot(document.getElementById("root")!).render(<App />);
