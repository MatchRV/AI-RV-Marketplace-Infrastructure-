import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";
import { registerMatchrvTools } from "./agent/webmcp";

// Register WebMCP tools at module load (before React render) so ChatGPT's
// in-app browser sees them as top-level page JS as early as possible.
// Idempotent — App's AgentBridge useEffect will no-op if this already ran.
try {
  registerMatchrvTools();
} catch (err) {
  console.warn("[webmcp] early registration failed:", err);
}

// The server shell supplies crawler metadata. React owns it after startup;
// remove the shell copies before React 19 hoists route metadata into <head>.
document.querySelectorAll('head > title, head > meta[name="description"]').forEach(node => node.remove());

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
