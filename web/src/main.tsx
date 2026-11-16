import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/sora/wght.css";
import "@fontsource/libre-caslon-text/400-italic.css";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
