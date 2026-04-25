import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AppProviders } from "./app/providers";
import { navigate } from "./app/navigate";
import "./styles/globals.css";
import "./i18n";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container not found");
}

createRoot(container).render(
  <React.StrictMode>
    <AppProviders>
      <RouterProvider router={navigate} />
    </AppProviders>
  </React.StrictMode>,
);
