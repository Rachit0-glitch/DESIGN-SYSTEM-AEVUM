import React from "react";
import { createRoot } from "react-dom/client";
import { StudioErrorBoundary, StudioRoot } from "./main.js";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StudioErrorBoundary>
      <StudioRoot />
    </StudioErrorBoundary>
  </React.StrictMode>,
);
