/**
 * Auto-install the T3Code VS Code extension by creating a symlink/junction
 * in the VS Code and Cursor extensions directories.
 *
 * - Windows: uses junctions (no admin privileges required)
 * - macOS/Linux: uses regular symlinks
 *
 * Runs once at startup, silently skips if editors aren't installed.
 */

import { symlink, readlink, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir, platform } from "node:os";

const EXTENSION_NAME = "t3code-bridge";

/** Resolve the extension source directory relative to the server package. */
function getExtensionSourceDir(): string {
  // Server is at apps/server/src/; extension is at extensions/vscode-t3code/
  return resolve(import.meta.dirname, "..", "..", "..", "extensions", "vscode-t3code");
}

export async function installVscodeExtension(): Promise<void> {
  const extensionSourceDir = getExtensionSourceDir();

  // Verify the extension source actually exists
  try {
    await access(extensionSourceDir);
  } catch {
    console.log(
      `[vscode-ext] Extension source not found at ${extensionSourceDir} — skipping auto-install`,
    );
    return;
  }

  const editorExtDirs = [
    join(homedir(), ".vscode", "extensions"),
    join(homedir(), ".cursor", "extensions"),
  ];

  for (const dir of editorExtDirs) {
    // Skip if the editor isn't installed (extensions dir doesn't exist)
    try {
      await access(dir);
    } catch {
      continue;
    }

    const linkPath = join(dir, EXTENSION_NAME);

    // Check if already linked correctly
    try {
      const existing = await readlink(linkPath);
      if (resolve(existing) === resolve(extensionSourceDir)) {
        continue; // already correct
      }
    } catch {
      // Doesn't exist yet — proceed
    }

    // Create symlink: junction on Windows (no admin), regular symlink otherwise
    const type = platform() === "win32" ? "junction" : "dir";
    try {
      await symlink(extensionSourceDir, linkPath, type);
      console.log(`[vscode-ext] Installed extension link: ${linkPath} -> ${extensionSourceDir}`);
    } catch (err: any) {
      if (err.code === "EEXIST") {
        // Link exists but points somewhere else — don't overwrite
        console.log(`[vscode-ext] ${linkPath} already exists (pointing elsewhere) — skipping`);
      } else {
        console.warn(`[vscode-ext] Failed to create link at ${linkPath}: ${err.message}`);
      }
    }
  }
}
