/**
 * 2AM-Code fork: Human-readable preview formatting for tool calls.
 * Kept in a separate file to avoid merge conflicts with upstream.
 */

/**
 * Given a tool name and its input parameters, return a clean human-readable
 * preview string, or `null` to fall back to the default behaviour.
 */
export function formatToolPreview(
  toolName: string | undefined,
  input: Record<string, unknown> | undefined,
  workspaceRoot: string | undefined,
): string | null {
  if (!toolName || !input) return null;

  switch (toolName) {
    case "Read": {
      const fp = asString(input.file_path);
      if (!fp) return null;
      const rel = toRelative(fp, workspaceRoot);
      const parts: string[] = [rel];
      if (input.offset != null || input.limit != null) {
        const o = asNumber(input.offset);
        const l = asNumber(input.limit);
        if (o != null && l != null) parts.push(`lines ${o}-${o + l}`);
        else if (o != null) parts.push(`from line ${o}`);
        else if (l != null) parts.push(`first ${l} lines`);
      }
      if (input.pages != null) parts.push(`pages ${input.pages}`);
      return parts.join(" ");
    }

    case "Edit": {
      const fp = asString(input.file_path);
      if (!fp) return null;
      return toRelative(fp, workspaceRoot);
    }

    case "Write": {
      const fp = asString(input.file_path);
      if (!fp) return null;
      return toRelative(fp, workspaceRoot);
    }

    case "Grep": {
      const pattern = asString(input.pattern);
      if (!pattern) return null;
      const p = asString(input.path);
      const parts = [`/${truncate(pattern, 40)}/`];
      if (p) parts.push(`in ${toRelative(p, workspaceRoot)}`);
      else if (input.glob) parts.push(`in ${input.glob}`);
      return parts.join(" ");
    }

    case "Glob": {
      const pattern = asString(input.pattern);
      if (!pattern) return null;
      const p = asString(input.path);
      const parts = [truncate(pattern, 50)];
      if (p) parts.push(`in ${toRelative(p, workspaceRoot)}`);
      return parts.join(" ");
    }

    case "ToolSearch": {
      const query = asString(input.query);
      return query ? truncate(query, 60) : null;
    }

    case "WebFetch": {
      const url = asString(input.url);
      return url ? truncate(url, 80) : null;
    }

    case "WebSearch": {
      const query = asString(input.query);
      return query ? truncate(query, 60) : null;
    }

    case "TodoWrite": {
      const todos = input.todos;
      if (!Array.isArray(todos)) return null;
      const count = todos.length;
      return `${count} item${count === 1 ? "" : "s"}`;
    }

    case "NotebookEdit": {
      const fp = asString(input.notebook_path ?? input.file_path);
      if (!fp) return null;
      const cell = asNumber(input.cell_index);
      const rel = toRelative(fp, workspaceRoot);
      return cell != null ? `${rel} cell ${cell}` : rel;
    }

    default:
      return null;
  }
}

function basename(filePath: string): string {
  const norm = filePath.replace(/\\/g, "/");
  const last = norm.lastIndexOf("/");
  return last >= 0 ? norm.slice(last + 1) : norm;
}

function toRelative(filePath: string, workspaceRoot: string | undefined): string {
  if (!workspaceRoot) return basename(filePath);
  const normFile = filePath.replace(/\\/g, "/");
  const normRoot = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (normFile.startsWith(normRoot + "/")) {
    return normFile.slice(normRoot.length + 1);
  }
  return basename(filePath);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + "…";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
