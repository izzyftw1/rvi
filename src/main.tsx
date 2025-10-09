import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { SiteProvider } from "./hooks/useSiteContext.tsx";

createRoot(document.getElementById("root")!).render(
  <SiteProvider>
    <App />
  </SiteProvider>
);
