import path from "path";
import react from "@vitejs/plugin-react";
import tailwind from "tailwindcss";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_BASE_PATH");
  const basePath = env.VITE_BASE_PATH || "/";

  return {
    plugins: [react()],
    base: basePath,
    css: {
      postcss: {
        plugins: [tailwind()],
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('recharts')) {
              return 'charts';
            }

            if (id.includes('html2canvas') || id.includes('jspdf') || id.includes('xlsx')) {
              return 'export-tools';
            }

            if (id.includes('react') || id.includes('node_modules/scheduler')) {
              return 'vendor';
            }

            return 'misc-vendor';
          },
        },
      },
    },
  };
});
