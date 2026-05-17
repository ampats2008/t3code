#!/usr/bin/env node
/**
 * Pre-tool-use hook: validate 2AM-Code commit message convention.
 *
 * Fires on every Bash tool call. If the command is a `git commit`,
 * the message must match:
 *
 *   2AM: <type>(<slug>): <message>
 *
 * Types: feat | fix | chore | refactor | docs | test | style
 * Slug:  kebab-case identifier grouping related commits (e.g. context-meter)
 *
 * Exit 0 → allow  |  Exit 1 → block (message printed to user)
 */

const VALID_TYPES = ["feat", "fix", "chore", "refactor", "docs", "test", "style"];
const CONVENTION_RE = /^2AM: (feat|fix|chore|refactor|docs|test|style)\([a-z0-9][a-z0-9-]*\): .+/;

function extractCommitMessage(command) {
  // Check heredoc form FIRST — Claude Code uses:
  //   git commit -m "$(cat <<'EOF'\n...\nEOF\n)"
  // The plain regexes below would match the outer quotes and capture the
  // raw $(cat <<...) shell command as the "message", so heredoc must win.
  const heredocRe = /git\s+commit\b.*<<'?(\w+)'?\n([\s\S]*?)\n\s*\1/;
  const heredocMatch = command.match(heredocRe);
  if (heredocMatch) return heredocMatch[2].trim();

  // Match: git commit -m "..." or git commit -m '...'
  // Also handles --message= and multi-flag forms like -am
  const patterns = [
    /git\s+commit\b[^'"]*(?:-m|--message)\s+"((?:[^"\\]|\\.)*)"/s,
    /git\s+commit\b[^'"]*(?:-m|--message)\s+'((?:[^'\\]|\\.)*)'/s,
    /git\s+commit\b[^'"]*(?:-m|--message)=?"((?:[^"\\]|\\.)*)"/s,
  ];

  for (const re of patterns) {
    const match = command.match(re);
    if (match) return match[1].trim();
  }

  return null;
}

function isGitCommit(command) {
  return /git\s+commit\b/.test(command);
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    // Can't parse → don't block
    process.exit(0);
  }

  const toolName = payload?.tool_name ?? payload?.tool ?? "";
  const command = payload?.tool_input?.command ?? "";

  // Only care about Bash tool calls that are git commits
  if (toolName !== "Bash" || !isGitCommit(command)) {
    process.exit(0);
  }

  const message = extractCommitMessage(command);

  // Can't extract message (heredoc, variable, etc.) → let it through
  if (!message) process.exit(0);

  // Skip merge/rebase auto-commits and amend --no-edit
  if (
    message.startsWith("Merge ") ||
    message.startsWith("Revert ") ||
    command.includes("--no-edit")
  ) {
    process.exit(0);
  }

  if (CONVENTION_RE.test(message)) {
    process.exit(0); // ✅ valid
  }

  // ❌ invalid — explain and block
  const detectedType = VALID_TYPES.find(
    (t) => message.startsWith(t + "(") || message.startsWith(t + ":"),
  );
  const missing2am = !message.startsWith("2AM:");

  let hint = "";
  if (missing2am) {
    hint = `\n  Hint: message must start with "2AM: "`;
  } else if (detectedType) {
    hint = `\n  Hint: looks like you have the right type — check the slug and spacing.`;
  }

  console.error(
    [
      ``,
      `  ✗ Commit blocked: message doesn't follow the 2AM-Code convention.`,
      ``,
      `  Required format:`,
      `    2AM: <type>(<slug>): <message>`,
      ``,
      `  Valid types: ${VALID_TYPES.join(", ")}`,
      `  Slug: kebab-case, use the same slug for all commits in a feature`,
      ``,
      `  Examples:`,
      `    2AM: feat(context-meter): add token usage progress bar`,
      `    2AM: fix(diff-panel): clamp negative line counts`,
      `    2AM: chore(fork-tooling): update rebase strategy docs`,
      ``,
      `  Your message: "${message}"${hint}`,
      ``,
    ].join("\n"),
  );

  process.exit(1);
}

main();
