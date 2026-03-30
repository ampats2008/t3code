#!/usr/bin/env node
/**
 * Converts apps/desktop/resources/icon.png into all required asset formats
 * for both dev and prod icon locations.
 *
 * Run with: bun scripts/update-icons.mjs
 */

import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const SRC = join(ROOT, "apps/desktop/resources/icon.png");

console.log("Source icon:", SRC);

async function resizePng(size) {
  return sharp(SRC)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function makeIco(sizes) {
  // Build ICO file manually: header + directory + image data (PNG-compressed entries)
  const images = await Promise.all(
    sizes.map(async (size) => {
      const buf = await sharp(SRC)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      return { size, buf };
    }),
  );

  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * images.length;
  let offset = headerSize + dirSize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(dirSize);
  for (let i = 0; i < images.length; i++) {
    const { size, buf } = images[i];
    const entry = dir.subarray(i * dirEntrySize, (i + 1) * dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buf.length;
  }

  return Buffer.concat([header, dir, ...images.map((i) => i.buf)]);
}

async function main() {
  // --- prod assets ---
  const prodDir = join(ROOT, "assets/prod");

  // 1024px PNGs (macOS, Linux, universal)
  console.log("Generating prod 1024px PNGs...");
  const png1024 = await resizePng(1024);
  writeFileSync(join(prodDir, "black-macos-1024.png"), png1024);
  writeFileSync(join(prodDir, "black-universal-1024.png"), png1024);
  writeFileSync(join(prodDir, "black-ios-1024.png"), png1024);
  console.log("  assets/prod/black-macos-1024.png");
  console.log("  assets/prod/black-universal-1024.png");
  console.log("  assets/prod/black-ios-1024.png");

  // Windows ICO (16, 24, 32, 48, 64, 128, 256)
  console.log("Generating prod Windows ICO...");
  const prodIco = await makeIco([16, 24, 32, 48, 64, 128, 256]);
  writeFileSync(join(prodDir, "t3-black-windows.ico"), prodIco);
  console.log("  assets/prod/t3-black-windows.ico");

  // Web favicons
  console.log("Generating prod web favicons...");
  writeFileSync(join(prodDir, "t3-black-web-favicon-16x16.png"), await resizePng(16));
  writeFileSync(join(prodDir, "t3-black-web-favicon-32x32.png"), await resizePng(32));
  writeFileSync(join(prodDir, "t3-black-web-apple-touch-180.png"), await resizePng(180));
  const webIco = await makeIco([16, 32, 48]);
  writeFileSync(join(prodDir, "t3-black-web-favicon.ico"), webIco);
  console.log("  assets/prod/t3-black-web-favicon*.{ico,png}");
  console.log("  assets/prod/t3-black-web-apple-touch-180.png");

  // --- dev assets ---
  const devDir = join(ROOT, "assets/dev");

  console.log("Generating dev 1024px PNGs...");
  writeFileSync(join(devDir, "blueprint-macos-1024.png"), png1024);
  writeFileSync(join(devDir, "blueprint-universal-1024.png"), png1024);
  writeFileSync(join(devDir, "blueprint-ios-1024.png"), png1024);
  console.log("  assets/dev/blueprint-macos-1024.png");
  console.log("  assets/dev/blueprint-universal-1024.png");
  console.log("  assets/dev/blueprint-ios-1024.png");

  console.log("Generating dev Windows ICO...");
  writeFileSync(join(devDir, "blueprint-windows.ico"), prodIco);
  console.log("  assets/dev/blueprint-windows.ico");

  console.log("Generating dev web favicons...");
  writeFileSync(join(devDir, "blueprint-web-favicon-16x16.png"), await resizePng(16));
  writeFileSync(join(devDir, "blueprint-web-favicon-32x32.png"), await resizePng(32));
  writeFileSync(join(devDir, "blueprint-web-apple-touch-180.png"), await resizePng(180));
  const devWebIco = await makeIco([16, 32, 48]);
  writeFileSync(join(devDir, "blueprint-web-favicon.ico"), devWebIco);
  console.log("  assets/dev/blueprint-web-favicon*.{ico,png}");
  console.log("  assets/dev/blueprint-web-apple-touch-180.png");

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
