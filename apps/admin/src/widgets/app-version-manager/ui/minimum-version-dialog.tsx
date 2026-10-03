import { useEffect, useRef } from "react";

export function MinimumVersionDialog({
  minimum,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  minimum: string;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="app-version-dialog"
      data-testid="app-version-confirm-dialog"
      aria-labelledby="app-version-confirm-title"
      aria-describedby="app-version-confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <span className="eyebrow">Обязательное обновление</span>
      <h2 id="app-version-confirm-title">Ограничить доступ старым версиям?</h2>
      <p id="app-version-confirm-description">
        Пользователи версий ниже <strong>{minimum}</strong> не смогут
        пользоваться приложением, пока не обновятся. Убедитесь, что обновление
        уже доступно всем в магазине.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          autoFocus
          type="button"
          className="secondary-button"
          data-testid="app-version-confirm-cancel"
          disabled={pending}
          onClick={onCancel}
        >
          Отмена
        </button>
        <button
          type="button"
          className="primary-button"
          data-testid="app-version-confirm-save"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Сохраняем…" : "Подтвердить и сохранить"}
        </button>
      </div>
    </dialog>
  );
}
