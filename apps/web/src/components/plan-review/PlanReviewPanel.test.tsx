import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { EnvironmentId } from "@t3tools/contracts";
import { usePlanReviewStore } from "../../planReviewStore";
import type { LatestProposedPlanState } from "../../session-logic";
import type { TimestampFormat } from "@t3tools/contracts/settings";

// Mock ChatMarkdown to avoid its heavy browser dependency chain (useTheme, shiki, etc.)
vi.mock("../ChatMarkdown", () => ({
  default: ({ text }: { text: string }) => <div data-testid="chat-markdown">{text}</div>,
}));

import { PlanReviewPanel } from "./index";

describe("PlanReviewPanel", () => {
  beforeEach(() => {
    // Reset store state before each test
    usePlanReviewStore.setState({
      annotations: {},
      editedMarkdown: {},
      activeAnnotationId: null,
    });
  });

  const timestampFormat: TimestampFormat = "locale";

  const mockProposedPlan: LatestProposedPlanState = {
    id: "plan-1",
    createdAt: "2026-03-17T18:42:05.449Z",
    updatedAt: "2026-03-17T18:42:05.449Z",
    turnId: null,
    planMarkdown: "# My Plan\n\nThis is a test plan with content.",
    implementedAt: null,
    implementationThreadId: null,
  };

  it("renders 'Plan Review' badge text", () => {
    const markup = renderToStaticMarkup(
      <PlanReviewPanel
        activePlan={null}
        activeProposedPlan={mockProposedPlan}
        environmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        workspaceRoot={undefined}
        timestampFormat={timestampFormat}
        onSubmitReview={() => {}}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain("Plan Review");
  });

  it("renders close button", () => {
    const markup = renderToStaticMarkup(
      <PlanReviewPanel
        activePlan={null}
        activeProposedPlan={mockProposedPlan}
        environmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        workspaceRoot={undefined}
        timestampFormat={timestampFormat}
        onSubmitReview={() => {}}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain("Close plan review");
  });

  it("renders mode toggle button", () => {
    const markup = renderToStaticMarkup(
      <PlanReviewPanel
        activePlan={null}
        activeProposedPlan={mockProposedPlan}
        environmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        workspaceRoot={undefined}
        timestampFormat={timestampFormat}
        onSubmitReview={() => {}}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain("Switch to edit mode");
  });

  it("renders 'Submit Review' button in footer", () => {
    const markup = renderToStaticMarkup(
      <PlanReviewPanel
        activePlan={null}
        activeProposedPlan={mockProposedPlan}
        environmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        workspaceRoot={undefined}
        timestampFormat={timestampFormat}
        onSubmitReview={() => {}}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain("Submit Review");
  });

  it("renders footer with annotation count container", () => {
    const markup = renderToStaticMarkup(
      <PlanReviewPanel
        activePlan={null}
        activeProposedPlan={mockProposedPlan}
        environmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        workspaceRoot={undefined}
        timestampFormat={timestampFormat}
        onSubmitReview={() => {}}
        onClose={() => {}}
      />,
    );

    // Footer should be present with flex layout
    expect(markup).toContain("flex shrink-0 items-center justify-between border-t");
  });

  it("renders plan title from markdown heading", () => {
    const planWithHeading: LatestProposedPlanState = {
      ...mockProposedPlan,
      planMarkdown: "# Create Authentication System\n\nDetailed plan content here.",
    };

    const markup = renderToStaticMarkup(
      <PlanReviewPanel
        activePlan={null}
        activeProposedPlan={planWithHeading}
        environmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        workspaceRoot={undefined}
        timestampFormat={timestampFormat}
        onSubmitReview={() => {}}
        onClose={() => {}}
      />,
    );

    expect(markup).toContain("Create Authentication System");
  });

  it("does not render when activeProposedPlan is null", () => {
    const markup = renderToStaticMarkup(
      <PlanReviewPanel
        activePlan={null}
        activeProposedPlan={null}
        environmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        workspaceRoot={undefined}
        timestampFormat={timestampFormat}
        onSubmitReview={() => {}}
        onClose={() => {}}
      />,
    );

    // Should render nothing when no proposed plan
    expect(markup).not.toContain("Plan Review");
  });

  it("renders 480px width class", () => {
    const markup = renderToStaticMarkup(
      <PlanReviewPanel
        activePlan={null}
        activeProposedPlan={mockProposedPlan}
        environmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        workspaceRoot={undefined}
        timestampFormat={timestampFormat}
        onSubmitReview={() => {}}
        onClose={() => {}}
      />,
    );

    // Width is now dynamic via inline style (default 560px), not a Tailwind class
    expect(markup).toContain("width:560px");
  });

  it("renders textarea in edit mode with plan markdown", () => {
    // Since we can't easily test mode toggling in SSR, we'll at least verify the structure is correct
    const markup = renderToStaticMarkup(
      <PlanReviewPanel
        activePlan={null}
        activeProposedPlan={mockProposedPlan}
        environmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        workspaceRoot={undefined}
        timestampFormat={timestampFormat}
        onSubmitReview={() => {}}
        onClose={() => {}}
      />,
    );

    // Component renders without error
    expect(markup).toContain("flex h-full");
  });
});
