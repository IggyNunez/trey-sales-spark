import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Conditionally import lovable-tagger only in development
const loadComponentTagger = async (mode: string) => {
  if (mode === "development") {
    try {
      const { componentTagger } = await import("lovable-tagger");
      return componentTagger();
    } catch {
      return null;
    }
  }
  return null;
};

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const tagger = await loadComponentTagger(mode);

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), tagger].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      sourcemap: false,
      minify: "terser" as const,
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-tabs"],
            supabase: ["@supabase/supabase-js"],
          },
        },
      },
    },
  };
});
