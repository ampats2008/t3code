import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const cacheFile = join(
  process.env.USERPROFILE,
  ".bun/install/cache/node-pty@1.1.0@@@1/deps/winpty/src/winpty.gyp",
);

const original = readFileSync(cacheFile, "utf8");
console.log("Current lines 12-14:");
console.log(original.split("\n").slice(11, 15).join("\n"));
console.log("Current line 25:");
console.log(original.split("\n")[24]);

// Restore to known-good original state by fixing the two lines
let restored = original
  // Fix the broken line 13 (was mangled to 'none',}, with closing brace eaten)
  .replace(
    /'WINPTY_COMMIT_HASH%': 'none',\},/,
    `'WINPTY_COMMIT_HASH%': '<!(cmd /c "cd shared && GetCommitHash.bat")',\n    },`,
  )
  // Remove any 'call' that was injected into UpdateGenVersion line
  .replace(/cd shared && call UpdateGenVersion\.bat/, "cd shared && UpdateGenVersion.bat")
  // Remove any 'call' that was injected into GetCommitHash line
  .replace(/cd shared && call GetCommitHash\.bat/, "cd shared && GetCommitHash.bat");

if (restored === original) {
  console.log("File already in original state or pattern not found.");
} else {
  // Break hard link before writing so we don't corrupt other references
  const tmp = cacheFile + ".tmp";
  writeFileSync(tmp, restored, "utf8");
  unlinkSync(cacheFile);
  writeFileSync(cacheFile, restored, "utf8");
  console.log("\nRestored to original. New lines 12-14:");
  console.log(restored.split("\n").slice(11, 15).join("\n"));
  console.log("New line 25:");
  console.log(restored.split("\n")[24]);
}
