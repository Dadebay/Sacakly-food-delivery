import { useEffect, useId, useRef, type ReactNode } from "react";

export function InventoryDialog({
  title,
  description,
  children,
  onClose,
  busy = false,
  testId,
  returnFocusTestId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  testId: string;
  returnFocusTestId: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    node?.showModal();
    node?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      node?.close();
      const trigger = document.querySelector<HTMLElement>(
        `[data-testid="${returnFocusTestId}"]`,
      );
      if (trigger) trigger.focus();
      else if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [returnFocusTestId]);
  return (
    <dialog
      ref={ref}
      className="inventory-dialog"
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="inventory-dialog-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="inventory-icon-button"
          aria-label="Закрыть окно"
          data-testid={testId + "-close"}
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
