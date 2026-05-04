import { PenLineIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";

interface EditMessageBannerProps {
  onCancel: () => void;
}

/**
 * Banner shown above the input box when the user is editing a past message
 * to create a fork. Indicates that submitting will branch from that point.
 */
export function EditMessageBanner({ onCancel }: EditMessageBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent-foreground/70">
      <PenLineIcon className="size-3.5 shrink-0" />
      <span className="flex-1">
        Editing message — submit will create a <strong>new branch</strong> from this point
      </span>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="h-5 w-5 p-0"
        onClick={onCancel}
        title="Cancel edit"
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}
