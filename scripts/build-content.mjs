import { build } from "esbuild";
await build({
  entryPoints: ["src/content/chessComContent.tsx"],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outfile: "dist/content.js",
  minify: true,
  define: {
    "import.meta.env.DEV": process.argv.includes("--debug") ? "true" : "false",
    "process.env.NODE_ENV": '"production"',
  },
});
