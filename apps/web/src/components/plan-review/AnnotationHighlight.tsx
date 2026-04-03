import { MessageSquare } from "lucide-react";

export interface AnnotationHighlightProps {
  children: React.ReactNode;
  comment: string;
  annotationId: string;
  onClick: (annotationId: string, element: HTMLElement) => void;
}

export function AnnotationHighlight({
  children,
  comment,
  annotationId,
  onClick,
}: AnnotationHighlightProps) {
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    onClick(annotationId, event.currentTarget);
  };

  return (
    <mark
      className="bg-amber-500/20 rounded-sm cursor-pointer hover:bg-amber-500/30 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50"
      title={comment}
      aria-label={comment}
      role="button"
      tabIndex={0}
      data-annotation-id={annotationId}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(annotationId, e.currentTarget);
        }
      }}
    >
      {children}
      <MessageSquare className="text-amber-500/60 inline ml-0.5 size-3" />
    </mark>
  );
}
