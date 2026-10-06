// Generates the PWA icons in public/icons and src/app from one SVG.
// Run with: npm run icons
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const GIFT = `
  <g fill="#fff">
    <rect x="120" y="206" width="272" height="64" rx="16"/>
    <rect x="140" y="270" width="232" height="132" rx="18"/>
    <path d="M256 206c-22-58-82-86-108-58-24 26 4 58 60 58zm0 0c22-58 82-86 108-58 24 26-4 58-60 58z"/>
  </g>
  <rect x="236" y="206" width="40" height="196" fill="#7c3aed"/>`;

const BG = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#6d28d9"/>
    </linearGradient>
  </defs>`;

// Rounded tile, transparent corners: browsers and desktop installs.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${BG}
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>${GIFT}</svg>`;

// Full-bleed square: iOS rounds it itself; Android masks it (glyph kept inside the 80% safe zone).
const square = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${BG}
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 290) scale(${scale}) translate(-256 -290)">${GIFT}</g></svg>`;

// Monochrome silhouette for the Android notification badge.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="96 110 320 320">
  <g fill="#fff">
    <rect x="120" y="206" width="272" height="64" rx="16"/>
    <rect x="140" y="270" width="232" height="132" rx="18"/>
    <path d="M256 206c-22-58-82-86-108-58-24 26 4 58 60 58zm0 0c22-58 82-86 108-58 24 26-4 58-60 58z"/>
  </g>
  <rect x="236" y="206" width="40" height="196" fill="#000"/></svg>`;

const outputs = [
  ["public/icons/icon-192.png", rounded, 192],
  ["public/icons/icon-512.png", rounded, 512],
  ["public/icons/maskable-512.png", square(0.78), 512],
  ["public/icons/apple-touch-icon.png", square(0.9), 180],
  ["public/icons/badge-96.png", badge, 96],
  ["src/app/apple-icon.png", square(0.9), 180],
];

await mkdir("public/icons", { recursive: true });
for (const [file, svg, size] of outputs) {
  let image = sharp(Buffer.from(svg), { density: 300 }).resize(size, size);
  if (file.includes("badge")) {
    // Keep only white pixels: the ribbon gap becomes transparent.
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const white = data[i] > 128 && data[i + 1] > 128 && data[i + 2] > 128;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = white ? data[i + 3] : 0;
    }
    image = sharp(data, { raw: info });
  }
  await writeFile(file, await image.png({ compressionLevel: 9 }).toBuffer());
  console.log(`wrote ${file} (${size}px)`);
}
await writeFile("src/app/icon.svg", rounded.trim() + "\n");
console.log("wrote src/app/icon.svg");
