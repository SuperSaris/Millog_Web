import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n"; // Initialize i18next before anything else
import "./index.css";
import { App } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
