import * as vscode from "vscode";

export interface ReviewComment {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
  body: string;
}

/**
 * Creates a VS Code CommentController for T3Code review comments.
 * Users can click the gutter "+" icon to add comment threads on files/diffs,
 * then submit all comments as a structured review to T3Code.
 */
export function createCommentController(context: vscode.ExtensionContext): T3CodeCommentController {
  const controller = vscode.comments.createCommentController("t3code-review", "T3Code Review");

  // Enable the gutter "+" icon on all files
  controller.commentingRangeProvider = {
    provideCommentingRanges(document: vscode.TextDocument) {
      return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
    },
  };

  context.subscriptions.push(controller);

  const threads: vscode.CommentThread[] = [];

  function updateContextKey() {
    vscode.commands.executeCommand("setContext", "t3code.hasReviewComments", threads.length > 0);
  }

  const instance: T3CodeCommentController = {
    controller,
    threads,

    createThread(reply: vscode.CommentReply): void {
      const thread = reply.thread;
      const comment: vscode.Comment = {
        body: reply.text,
        mode: vscode.CommentMode.Preview,
        author: { name: "You" },
      };
      thread.comments = [...thread.comments, comment];
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      threads.push(thread);
      updateContextKey();
    },

    deleteThread(thread: vscode.CommentThread): void {
      const idx = threads.indexOf(thread);
      if (idx !== -1) {
        threads.splice(idx, 1);
      }
      thread.dispose();
      updateContextKey();
    },

    replyToThread(reply: vscode.CommentReply): void {
      const comment: vscode.Comment = {
        body: reply.text,
        mode: vscode.CommentMode.Preview,
        author: { name: "You" },
      };
      reply.thread.comments = [...reply.thread.comments, comment];
    },

    async collectComments(): Promise<ReviewComment[]> {
      const comments: ReviewComment[] = [];
      for (const thread of threads) {
        const uri = thread.uri;
        const range = thread.range;
        const bodies = thread.comments.map((c) =>
          typeof c.body === "string" ? c.body : (c.body as vscode.MarkdownString).value,
        );
        // Only include code text for sub-line selections (single line with
        // a specific column range). Multi-line ranges are conveyed by
        // startLine/endLine alone — the agent can infer the code from the file.
        const isSingleLineSelection =
          range.start.line === range.end.line &&
          (range.start.character !== 0 || range.end.character !== 0);
        const text = isSingleLineSelection ? await getTextFromUri(uri, range) : "";
        comments.push({
          file: uri.fsPath,
          startLine: range.start.line + 1,
          endLine: range.end.line + 1,
          text,
          body: bodies.join("\n"),
        });
      }
      return comments;
    },

    clearAll(): void {
      for (const thread of threads) {
        thread.dispose();
      }
      threads.length = 0;
      updateContextKey();
    },

    dispose(): void {
      instance.clearAll();
      controller.dispose();
    },
  };

  return instance;
}

export interface T3CodeCommentController {
  controller: vscode.CommentController;
  threads: vscode.CommentThread[];
  createThread(reply: vscode.CommentReply): void;
  deleteThread(thread: vscode.CommentThread): void;
  replyToThread(reply: vscode.CommentReply): void;
  collectComments(): Promise<ReviewComment[]>;
  clearAll(): void;
  dispose(): void;
}

async function getTextFromUri(uri: vscode.Uri, range: vscode.Range): Promise<string> {
  try {
    // Open the document if not already open
    const doc = await vscode.workspace.openTextDocument(uri);
    // Expand the range to full lines
    const startLine = range.start.line;
    const endLine = range.end.line;
    const fullRange = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);
    return doc.getText(fullRange);
  } catch {
    return "";
  }
}
