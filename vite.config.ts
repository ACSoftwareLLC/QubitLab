import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // Dev-only: proxy /auth calls to the local Wrangler Worker so HMR works
    // while the API runs on the Worker runtime. This proxy is not used in the
    // production build, which is served entirely from the same-origin Worker.
    proxy: {
      "/auth": {
        target: "http://localhost:8787",
        // Preserve the browser's Host header (e.g. localhost:5173) so it
        // matches the Origin header and passes the Worker's origin validation.
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const host = req.headers.host;
            if (host) {
              proxyReq.setHeader("Host", host);
            }
          });
        },
      },
    },
  },
});
