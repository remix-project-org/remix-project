import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  // Load all env vars (empty prefix) so we can use names without the VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    define: {
      "import.meta.env.CONTRACT_ADDRESS": JSON.stringify(env.CONTRACT_ADDRESS),
      "import.meta.env.RPC_URL": JSON.stringify(env.RPC_URL),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      proxy: {
        // Proxy football-data.org so the API key stays server-side (avoids CORS + key exposure).
        "/api/football": {
          target: "https://api.football-data.org/v4",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/football/, ""),
          headers: env.FOOTBALL_API_KEY
            ? { "X-Auth-Token": env.FOOTBALL_API_KEY }
            : undefined,
        },
      },
    },
  };
});
