import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import RecoveryBoundary from "@/components/vision/RecoveryBoundary";
import { SessionProvider } from "@/lib/session";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <RecoveryBoundary>
      <SessionProvider>
        <App />
      </SessionProvider>
    </RecoveryBoundary>
  </React.StrictMode>,
);
