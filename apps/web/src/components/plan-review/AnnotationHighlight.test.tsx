import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AnnotationHighlight } from "./AnnotationHighlight";

describe("AnnotationHighlight", () => {
  it("renders <mark> element with highlighted text", () => {
    const mockOnClick = vi.fn();
    const markup = renderToStaticMarkup(
      <AnnotationHighlight
        annotationId="ann-1"
        comment="This needs improvement"
        onClick={mockOnClick}
      >
        highlighted text
      </AnnotationHighlight>,
    );

    expect(markup).toContain("<mark");
    expect(markup).toContain("highlighted text");
    expect(markup).toContain("</mark>");
  });

  it("applies correct background styling class", () => {
    const mockOnClick = vi.fn();
    const markup = renderToStaticMarkup(
      <AnnotationHighlight
        annotationId="ann-1"
        comment="This needs improvement"
        onClick={mockOnClick}
      >
        highlighted text
      </AnnotationHighlight>,
    );

    expect(markup).toContain("bg-amber-500/20");
    expect(markup).toContain("hover:bg-amber-500/30");
    expect(markup).toContain("transition-colors");
    expect(markup).toContain("rounded-sm");
    expect(markup).toContain("cursor-pointer");
  });

  it("renders comment bubble indicator (svg or lucide icon)", () => {
    const mockOnClick = vi.fn();
    const markup = renderToStaticMarkup(
      <AnnotationHighlight
        annotationId="ann-1"
        comment="This needs improvement"
        onClick={mockOnClick}
      >
        highlighted text
      </AnnotationHighlight>,
    );

    // MessageSquare icon from lucide-react renders as SVG
    expect(markup).toContain("svg");
    expect(markup).toContain("text-amber-500/60");
  });

  it("includes comment text in title attribute", () => {
    const mockOnClick = vi.fn();
    const comment = "This needs improvement";
    const markup = renderToStaticMarkup(
      <AnnotationHighlight annotationId="ann-1" comment={comment} onClick={mockOnClick}>
        highlighted text
      </AnnotationHighlight>,
    );

    expect(markup).toContain(`title="${comment}"`);
    expect(markup).toContain(`aria-label="${comment}"`);
  });
});
