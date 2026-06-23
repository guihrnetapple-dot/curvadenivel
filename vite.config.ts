import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react";
          }
          if (id.includes("node_modules/@supabase")) {
            return "supabase";
          }
          if (id.includes("node_modules/leaflet") || id.includes("node_modules/leaflet-draw")) {
            return "leaflet";
          }
          if (id.includes("node_modules/recharts")) {
            return "graficos";
          }
          if (id.includes("node_modules/jszip")) {
            return "exportadores";
          }
          if (id.includes("node_modules/country-state-city")) {
            return "localizacao-cadastro";
          }
          if (id.includes("/src/componentes/MapaAltimetria")) {
            return "mapa";
          }
          if (id.includes("/src/utilitarios/exportacao") || id.includes("/src/utilitarios/importacaoGeografica")) {
            return "exportadores";
          }
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true
      }
    }
  }
});
