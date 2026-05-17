import { memo } from "react";

export const ComposerDiffReviewBanner = memo(function ComposerDiffReviewBanner({
  annotationCount,
}: {
  annotationCount: number;
}) {
  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="uppercase text-sm tracking-[0.2em]">Review</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {annotationCount} annotation{annotationCount !== 1 ? "s" : ""} ready to submit
        </span>
      </div>
    </div>
  );
});
