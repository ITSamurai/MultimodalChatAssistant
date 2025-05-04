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

// Add debugging information
console.log("Starting application with React...");

// Get the root element
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Could not find root element!");
} else {
  console.log("Found root element, rendering app");
  createRoot(rootElement).render(<App />);
}
