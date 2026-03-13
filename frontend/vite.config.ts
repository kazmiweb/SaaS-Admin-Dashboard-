import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl =
    env.VITE_API_BASE_URL ||
    env.VITE_BASE_URL ||
    env.REACT_APP_API_URL ||
    env.BASE_URL ||
    "/api";
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:8080";
  const shouldProxyApi = apiBaseUrl.startsWith("/");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        assets: path.resolve(__dirname, "src/assets"),
        vision: path.resolve(__dirname, "src/vision"),
        theme: path.resolve(__dirname, "src/vision/theme"),
        components: path.resolve(__dirname, "src/components"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: shouldProxyApi
        ? {
            [apiBaseUrl]: {
              target: proxyTarget,
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(new RegExp(`^${apiBaseUrl}`), ""),
            },
          }
        : undefined,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;

            if (id.includes("/@mui/x-data-grid/")) {
              return "mui-data-grid";
            }

            if (
              id.includes("/apexcharts/") ||
              id.includes("/react-apexcharts/")
            ) {
              return "charts";
            }

            if (
              id.includes("/jspdf/") ||
              id.includes("/jspdf-autotable/") ||
              id.includes("/html2canvas/")
            ) {
              return "export-tools";
            }

            if (
              id.includes("/reactflow/") ||
              id.includes("/dagre/")
            ) {
              return "graph-tools";
            }
          },
        },
      },
    },
  };
});
