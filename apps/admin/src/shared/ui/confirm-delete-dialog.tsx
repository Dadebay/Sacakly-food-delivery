import type { ReactNode } from "react";

function WarningIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9.5v4.2M12 17h.01" />
    </svg>
  );
}

export type ConfirmDeleteDialogProps = {
  titleId: string;
  title: string;
  description: ReactNode;
  note?: ReactNode;
  error?: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  dialogTestId?: string;
  cancelTestId?: string;
  confirmTestId?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  className?: string;
};

export function ConfirmDeleteDialog({
  titleId,
  title,
  description,
  note,
  error,
  isPending = false,
  onCancel,
  onConfirm,
  dialogTestId,
  cancelTestId,
  confirmTestId,
  confirmLabel = "Удалить навсегда",
  pendingLabel = "Удаляем…",
  className,
}: ConfirmDeleteDialogProps) {
  return (
    <div className="modal-backdrop" data-testid={dialogTestId}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal confirm-delete-modal ${className ?? ""}`}
        role="alertdialog"
      >
        <div className="confirm-delete-icon">
          <WarningIcon />
        </div>
        <header className="modal-head confirm-delete-head">
          <div>
            <span className="eyebrow confirm-delete-badge">
              Без восстановления
            </span>
            <h2 id={titleId}>{title}</h2>
          </div>
        </header>
        <p className="confirm-delete-description">{description}</p>
        {note && <small className="confirm-delete-note">{note}</small>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            autoFocus
            className="secondary-button"
            data-testid={cancelTestId}
            disabled={isPending}
            type="button"
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            className="danger-button"
            data-testid={confirmTestId}
            disabled={isPending}
            type="button"
            onClick={onConfirm}
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
