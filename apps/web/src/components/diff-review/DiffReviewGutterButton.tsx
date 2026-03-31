import { PlusIcon } from "lucide-react";
import { memo, useCallback, useRef } from "react";
import type { AnnotationSide } from "../../diffReviewStore";
import { buildActiveInputKey, useDiffReviewStore } from "../../diffReviewStore";

type GetHoveredLineResult = {
  lineNumber: number;
  side: AnnotationSide;
};

interface DiffReviewGutterButtonProps {
  getHoveredLine: () => GetHoveredLineResult | undefined;
  threadId: string;
  filePath: string;
}

export const DiffReviewGutterButton = memo(function DiffReviewGutterButton({
  getHoveredLine,
  threadId,
  filePath,
}: DiffReviewGutterButtonProps) {
  const getHoveredLineRef = useRef(getHoveredLine);
  getHoveredLineRef.current = getHoveredLine;

  const setActiveInputKey = useDiffReviewStore((s) => s.setActiveInputKey);

  const onClick = useCallback(() => {
    const hovered = getHoveredLineRef.current();
    if (!hovered) return;
    const key = buildActiveInputKey(
      threadId,
      filePath,
      hovered.lineNumber,
      hovered.side,
    );
    setActiveInputKey(key);
  }, [threadId, filePath, setActiveInputKey]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:bg-primary/15 hover:text-primary"
      aria-label="Add review comment"
      title="Add review comment"
    >
      <PlusIcon className="size-3.5" />
    </button>
  );
});
