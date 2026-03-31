import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnnotationPopoverContent } from "./AnnotationPopover";

describe("AnnotationPopoverContent", () => {
  it("renders textarea for comment input", () => {
    const markup = renderToStaticMarkup(
      <AnnotationPopoverContent
        selectedText="This is selected text"
        comment=""
        isEditing={false}
        isSaveDisabled={false}
        onCommentChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(markup).toContain('placeholder="Add your feedback..."');
    expect(markup).toContain("textarea");
  });

  it("renders Save and Cancel buttons", () => {
    const markup = renderToStaticMarkup(
      <AnnotationPopoverContent
        selectedText="This is selected text"
        comment=""
        isEditing={false}
        isSaveDisabled={false}
        onCommentChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(markup).toContain(">Save<");
    expect(markup).toContain(">Cancel<");
  });

  it("renders Delete button when isEditing is true", () => {
    const markup = renderToStaticMarkup(
      <AnnotationPopoverContent
        selectedText="This is selected text"
        comment="Existing comment"
        isEditing={true}
        isSaveDisabled={false}
        onCommentChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(markup).toContain(">Delete<");
  });

  it("does not render Delete button when isEditing is false", () => {
    const markup = renderToStaticMarkup(
      <AnnotationPopoverContent
        selectedText="This is selected text"
        comment=""
        isEditing={false}
        isSaveDisabled={false}
        onCommentChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(markup).not.toContain(">Delete<");
  });

  it("renders selected text preview truncated", () => {
    const longText =
      "This is a very long text that should be truncated to approximately eighty characters or so to make sure it fits nicely";

    const markup = renderToStaticMarkup(
      <AnnotationPopoverContent
        selectedText={longText}
        comment=""
        isEditing={false}
        isSaveDisabled={false}
        onCommentChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );

    // Should contain the text truncated with ellipsis
    expect(markup).toContain("…");
    // Should not contain the full long text
    expect(markup).not.toContain(longText);
  });

  it("renders selected text preview without truncation when short", () => {
    const shortText = "Short text";

    const markup = renderToStaticMarkup(
      <AnnotationPopoverContent
        selectedText={shortText}
        comment=""
        isEditing={false}
        isSaveDisabled={false}
        onCommentChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(markup).toContain(shortText);
    expect(markup).not.toContain("…");
  });
});
