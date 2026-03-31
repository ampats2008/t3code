import { PlusIcon } from "lucide-react";
import { memo } from "react";

/**
 * Visual-only gutter button. Click handling is done by @pierre/diffs'
 * `onGutterUtilityClick` option — the library manages the click event
 * internally and our button just provides the rendered content.
 */
export const DiffReviewGutterButton = memo(function DiffReviewGutterButton() {
  return (
    <span
      className="flex size-5 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:bg-primary/15 hover:text-primary"
      aria-label="Add review comment"
      title="Add review comment"
    >
      <PlusIcon className="size-3.5" />
    </span>
  );
});
