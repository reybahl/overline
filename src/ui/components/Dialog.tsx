import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { useEffect, type ReactNode } from "react";

import { cn } from "@/ui/components/cn";
import { setDialogOpen } from "@/ui/components/dialog-open";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  popupClassName?: string;
  trackId?: string;
};

export function Dialog({
  open,
  onOpenChange,
  children,
  popupClassName,
  trackId,
}: DialogProps) {
  useEffect(() => {
    if (!trackId) {
      return;
    }
    setDialogOpen(trackId, open);
    return () => {
      setDialogOpen(trackId, false);
    };
  }, [open, trackId]);

  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="ui-bui-backdrop" />
        <BaseDialog.Popup className={cn("ui-bui-popup", popupClassName)}>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

type DialogTitleProps = {
  children: ReactNode;
  className?: string;
};

export function DialogTitle({ children, className }: DialogTitleProps) {
  return (
    <BaseDialog.Title className={cn("ui-dialog__title", className)}>
      {children}
    </BaseDialog.Title>
  );
}

type DialogDescriptionProps = {
  children: ReactNode;
  className?: string;
};

export function DialogDescription({ children, className }: DialogDescriptionProps) {
  return (
    <BaseDialog.Description className={cn("ui-dialog__message", className)}>
      {children}
    </BaseDialog.Description>
  );
}

export function DialogClose(props: BaseDialog.Close.Props) {
  return <BaseDialog.Close {...props} />;
}
