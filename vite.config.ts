import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { VercelRequest, VercelResponse } from "@vercel/node";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "public-football-local",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? "/", "http://localhost");
          if (url.pathname !== "/api/public-football") return next();
          try {
            const module = await server.ssrLoadModule(
              "/api/public-football.ts",
            );
            const request = req as VercelRequest;
            request.query = Object.fromEntries(url.searchParams);
            const response = res as VercelResponse;
            response.status = (code: number) => {
              res.statusCode = code;
              return response;
            };
            response.json = (data: unknown) => {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
              return response;
            };
            await module.default(request, response);
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                message: "Matches could not be loaded. Try again shortly.",
              }),
            );
          }
        });
      },
    },
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/._*", "**/node_modules/**"],
  },
});
