import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

import { Aplicacao } from "./App";
import { AuthErrorBoundary } from "./componentes/auth/AuthErrorBoundary";
import { AuthGate } from "./componentes/auth/AuthGate";
import { AuthProvider } from "./context/AuthContext";
import "./styles.css";
import "./ui-pro.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthErrorBoundary>
      <AuthProvider>
        <AuthGate>
          <Aplicacao />
        </AuthGate>
      </AuthProvider>
    </AuthErrorBoundary>
  </React.StrictMode>
);
