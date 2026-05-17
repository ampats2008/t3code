import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ComposerPlanFollowUpBanner } from "./ComposerPlanFollowUpBanner";

describe("ComposerPlanFollowUpBanner", () => {
  it("renders 'Plan ready' text", () => {
    const markup = renderToStaticMarkup(<ComposerPlanFollowUpBanner planTitle={null} />);

    expect(markup.toLowerCase()).toContain("plan ready");
  });

  it("renders plan title when provided", () => {
    const markup = renderToStaticMarkup(
      <ComposerPlanFollowUpBanner planTitle="Add authentication" />,
    );

    expect(markup).toContain("Add authentication");
  });

  it("shows annotation count badge when annotationCount > 0", () => {
    const markup = renderToStaticMarkup(
      <ComposerPlanFollowUpBanner planTitle={null} annotationCount={3} />,
    );

    expect(markup).toContain("3");
    expect(markup).toContain("comments pending");
    expect(markup).toContain("bg-amber-500/15");
    expect(markup).toContain("text-amber-400");
  });

  it("shows singular 'comment' when annotationCount is 1", () => {
    const markup = renderToStaticMarkup(
      <ComposerPlanFollowUpBanner planTitle={null} annotationCount={1} />,
    );

    expect(markup).toContain("1");
    expect(markup).toContain("comment pending");
  });

  it("hides annotation count badge when annotationCount is 0", () => {
    const markup = renderToStaticMarkup(
      <ComposerPlanFollowUpBanner planTitle={null} annotationCount={0} />,
    );

    expect(markup).not.toContain("pending");
    expect(markup).not.toContain("bg-amber-500/15");
  });

  it("hides annotation count badge when annotationCount is undefined", () => {
    const markup = renderToStaticMarkup(
      <ComposerPlanFollowUpBanner planTitle={null} annotationCount={undefined} />,
    );

    expect(markup).not.toContain("pending");
    expect(markup).not.toContain("bg-amber-500/15");
  });

  it("preserves existing behavior when annotationCount prop not provided", () => {
    const markup = renderToStaticMarkup(<ComposerPlanFollowUpBanner planTitle="Update API" />);

    expect(markup.toLowerCase()).toContain("plan ready");
    expect(markup).toContain("Update API");
    expect(markup).not.toContain("pending");
  });
});
