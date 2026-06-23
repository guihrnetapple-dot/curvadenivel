import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";

import { AuthErrorBoundary } from "./componentes/auth/AuthErrorBoundary";
import { AuthGate } from "./componentes/auth/AuthGate";
import { CarregamentoInicial } from "./componentes/CarregamentoInicial";
import { AuthProvider } from "./context/AuthContext";
import "./styles.css";
import "./ui-pro.css";

const Aplicacao = lazy(() => import("./App").then((modulo) => ({ default: modulo.Aplicacao })));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthErrorBoundary>
      <AuthProvider>
        <AuthGate>
          <Suspense fallback={<CarregamentoInicial />}>
            <Aplicacao />
          </Suspense>
        </AuthGate>
      </AuthProvider>
    </AuthErrorBoundary>
  </React.StrictMode>
);
