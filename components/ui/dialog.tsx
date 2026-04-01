"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type DialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);

  if (!context) {
    throw new Error("Dialog components must be used within <Dialog>.");
  }

  return context;
}

export function Dialog({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ open, onOpenChange }), [onOpenChange, open]);
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

type DialogContentProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
};

function getFocusableElements(container: HTMLElement) {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden")
  );
}

export function DialogContent({ children, className, initialFocusRef, ...props }: DialogContentProps) {
  const { open, onOpenChange } = useDialogContext();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;

    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const target = initialFocusRef?.current;

      if (target) {
        target.focus();
        return;
      }

      const container = contentRef.current;
      if (!container) return;

      const focusables = getFocusableElements(container);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const container = contentRef.current;
      if (!container) {
        return;
      }

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;

      if (lastFocusedRef.current) {
        lastFocusedRef.current.focus();
      }
    };
  }, [initialFocusRef, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={() => onOpenChange(false)}
        aria-label="Close dialog"
      />

      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn("relative z-10 w-full", className)}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
