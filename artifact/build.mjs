// Builds Comper as a single self-contained HTML page for a Claude artifact:
// the shared React screens bundled with the artifact data layer, plus Tailwind CSS.
// Run with: npm run build:artifact   →   artifact/dist/comper.html
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
mkdirSync(dist, { recursive: true });

const js = await build({
  entryPoints: [join(here, "main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2022", "safari16"],
  minify: true,
  legalComments: "none",
  jsx: "automatic",
  tsconfig: join(here, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

execFileSync(
  process.execPath,
  [join(here, "..", "node_modules", "@tailwindcss", "cli", "dist", "index.mjs"), "-i", join(here, "styles.css"), "-o", join(dist, "comper.css"), "--minify"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
const css = readFileSync(join(dist, "comper.css"), "utf8");

// Artifact pages are wrapped in their own <html>/<head>/<body>: start with <title> and <style>.
const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<title>Comper</title>
<style>${css}</style>
<div id="comper-root"></div>
<script>${code}</script>
`;
writeFileSync(join(dist, "comper.html"), html);
console.log(`artifact/dist/comper.html  ${(html.length / 1024).toFixed(0)} KB`);
