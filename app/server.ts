import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import * as path from "path";

const app = new Hono();

// Serve static dashboard
app.get("/*", serveStatic({ root: path.resolve(import.meta.dir) }));

const PORT = 3200;
Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`Dashboard running at http://localhost:${PORT}`);
