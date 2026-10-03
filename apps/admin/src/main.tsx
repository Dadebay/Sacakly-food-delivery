import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import { App } from "@/src/app";
import "@/src/app/styles/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Admin root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
