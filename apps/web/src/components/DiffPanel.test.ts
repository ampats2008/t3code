import { describe, expect, it } from "vitest";
import { computeDefaultCollapsedFiles } from "./DiffPanel.logic";

describe("computeDefaultCollapsedFiles", () => {
  const filePaths = ["src/components/Foo.tsx", "src/components/Bar.tsx", "src/lib/utils.ts"];

  it("returns empty set when diffDefaultCollapsed is false", () => {
    const result = computeDefaultCollapsedFiles(filePaths, false, null);
    expect(result.size).toBe(0);
  });

  it("returns empty set when filePaths is empty", () => {
    const result = computeDefaultCollapsedFiles([], true, null);
    expect(result.size).toBe(0);
  });

  it("collapses all files when diffDefaultCollapsed is true and no file is selected", () => {
    const result = computeDefaultCollapsedFiles(filePaths, true, null);
    expect(result).toEqual(new Set(filePaths));
  });

  it("keeps selected file expanded when diffDefaultCollapsed is true", () => {
    const selected = "src/components/Bar.tsx";
    const result = computeDefaultCollapsedFiles(filePaths, true, selected);

    expect(result.has("src/components/Foo.tsx")).toBe(true);
    expect(result.has("src/lib/utils.ts")).toBe(true);
    expect(result.has(selected)).toBe(false);
    expect(result.size).toBe(2);
  });

  it("ignores selectedFilePath that does not match any file", () => {
    const result = computeDefaultCollapsedFiles(filePaths, true, "nonexistent.ts");
    expect(result).toEqual(new Set(filePaths));
  });

  it("returns empty set when diffDefaultCollapsed is false even with selectedFilePath", () => {
    const result = computeDefaultCollapsedFiles(filePaths, false, "src/lib/utils.ts");
    expect(result.size).toBe(0);
  });
});
