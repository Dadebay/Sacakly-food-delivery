import { useCallback, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { useAdminCafes, type Cafe } from "@/src/entities/catalog";
import { useCatalogActions } from "@/src/features/catalog-management";
import { resolveApiUrl } from "@/src/shared/api/api-client";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, ConfirmDeleteDialog, DataTable } from "@/src/shared/ui";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  PencilEdit02Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { cafeFormSchema, type CafeFormValues } from "../model/catalog-forms";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

export function CafeCatalogSection({
  canEdit,
  search,
}: {
  canEdit: boolean;
  search: string;
}) {
  const cafes = useAdminCafes();
  const actions = useCatalogActions();
  const [editing, setEditing] = useState<Cafe | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cafe | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CafeFormValues>({
    resolver: zodResolver(cafeFormSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      description: "",
      sortOrder: 0,
      isActive: true,
      image: undefined,
    },
  });
  const filteredCafes = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ru-RU");
    if (!normalized) return cafes.data ?? [];
    return (cafes.data ?? []).filter(
      (cafe) =>
        cafe.name.toLocaleLowerCase("ru-RU").includes(normalized) ||
        cafe.description?.toLocaleLowerCase("ru-RU").includes(normalized),
    );
  }, [cafes.data, search]);

  function openCreate() {
    setEditing(null);
    reset({
      name: "",
      description: "",
      sortOrder: 0,
      isActive: true,
      image: undefined,
    });
    setShowForm(true);
  }

  const openEdit = useCallback((cafe: Cafe) => {
    setEditing(cafe);
    reset({
      name: cafe.name,
      description: cafe.description ?? "",
      sortOrder: cafe.sortOrder,
      isActive: cafe.isActive,
      image: undefined,
    });
    setShowForm(true);
  }, [reset]);

  async function submit(values: CafeFormValues) {
    const file = (values.image as FileList | undefined)?.item(0);
    let imageUrl = editing?.imageUrl ?? undefined;
    if (file?.size)
      imageUrl = (await actions.uploadImage.mutateAsync(file)).url;
    const body = {
      name: values.name,
      description: values.description || null,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
      ...(imageUrl ? { imageUrl } : {}),
    };
    if (editing) {
      await actions.updateCafe.mutateAsync({ id: editing.id, body });
    } else {
      await actions.createCafe.mutateAsync(body);
    }
    setEditing(null);
    setShowForm(false);
    reset();
  }

  const columns = useMemo<ColumnDef<Cafe, unknown>[]>(
    () => [
      {
        header: "Кафе",
        cell: ({ row }) => (
          <div className="media-cell">
            {row.original.imageUrl ? (
              <img
                src={resolveApiUrl(row.original.imageUrl)}
                alt=""
                loading="lazy"
                width={64}
                height={48}
              />
            ) : (
              <span className="media-placeholder">◫</span>
            )}
            <div className="primary-cell">
              <strong>{row.original.name}</strong>
              {row.original.description && (
                <small>{row.original.description}</small>
              )}
              <small>
                {row.original.categoryCount} категорий · порядок{" "}
                {row.original.sortOrder}
              </small>
            </div>
          </div>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Доступно клиентам" : "Скрыто"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          canEdit && (
            <div className="row-actions">
              <button
                aria-label="Изменить кафе"
                className="secondary-button compact row-icon-button"
                data-testid={`cafe-edit-${row.original.id}`}
                onClick={() => openEdit(row.original)}
                type="button"
              >
                <HugeiconsIcon icon={PencilEdit02Icon} size={15} />
              </button>
              <button
                aria-label={
                  row.original.isActive ? "Скрыть кафе" : "Показать кафе"
                }
                className="text-button row-icon-button"
                data-testid={`cafe-visibility-${row.original.id}`}
                disabled={actions.updateCafe.isPending}
                onClick={() =>
                  actions.updateCafe.mutate({
                    id: row.original.id,
                    body: { isActive: !row.original.isActive },
                  })
                }
                type="button"
              >
                <HugeiconsIcon
                  icon={row.original.isActive ? ViewOffIcon : ViewIcon}
                  size={15}
                />
              </button>
              <button
                aria-label="Удалить кафе"
                className="text-button danger row-icon-button"
                data-testid={`cafe-delete-open-${row.original.id}`}
                disabled={actions.deleteCafe.isPending}
                onClick={() => setDeleteTarget(row.original)}
                type="button"
              >
                <HugeiconsIcon icon={Delete02Icon} size={15} />
              </button>
            </div>
          ),
      },
    ],
    [actions.deleteCafe.isPending, actions.updateCafe, canEdit, openEdit],
  );

  const mutationError = errorMessage(
    actions.uploadImage.error ||
      actions.createCafe.error ||
      actions.updateCafe.error ||
      actions.deleteCafe.error,
  );

  return (
    <>
      <article className="table-card" data-testid="cafes-catalog-section">
        <div className="card-title">
          <div>
            <h2>Кафе</h2>
            <small>
              Сначала клиент выбирает кафе, затем видит только его категории.
            </small>
          </div>
          <div className="header-actions">
            <span>{filteredCafes.length}</span>
            {canEdit && (
              <button
                className="primary-button compact"
                data-testid="catalog-cafe-open"
                onClick={openCreate}
                type="button"
              >
                + Кафе
              </button>
            )}
          </div>
        </div>
        {mutationError && <div className="inline-alert">{mutationError}</div>}
        <AsyncPanel
          pending={cafes.isPending}
          error={cafes.error}
          onRetry={() => void cafes.refetch()}
        >
          <DataTable
            columns={columns}
            data={filteredCafes}
            getRowId={(cafe) => cafe.id}
            empty="Кафе пока нет"
            label="Кафе каталога"
          />
        </AsyncPanel>
      </article>

      {showForm && (
        <div
          className="modal-backdrop catalog-editor-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setShowForm(false);
          }}
        >
          <form
            className="editor-card catalog-editor-modal catalog-category-modal"
            data-testid="cafe-form"
            noValidate
            onSubmit={handleSubmit(submit)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cafe-editor-title"
          >
            <div className="editor-title catalog-editor-title">
              <h2 id="cafe-editor-title">
                {editing ? "Изменить кафе" : "Новое кафе"}
              </h2>
              <button
                className="catalog-editor-close"
                data-testid="cafe-form-close"
                onClick={() => setShowForm(false)}
                type="button"
                aria-label="Закрыть редактор кафе"
              >
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                <span>Название</span>
                <input
                  data-testid="cafe-name"
                  {...register("name")}
                  aria-invalid={Boolean(errors.name)}
                  maxLength={120}
                />
                <FormFieldError message={errors.name?.message} />
              </label>
              <label>
                <span>Порядок</span>
                <input
                  data-testid="cafe-sort-order"
                  {...register("sortOrder", { valueAsNumber: true })}
                  aria-invalid={Boolean(errors.sortOrder)}
                  type="number"
                />
                <FormFieldError message={errors.sortOrder?.message} />
              </label>
              <label className="wide-field">
                <span>Описание</span>
                <textarea
                  data-testid="cafe-description"
                  {...register("description")}
                  aria-invalid={Boolean(errors.description)}
                  maxLength={1000}
                  rows={3}
                />
                <FormFieldError message={errors.description?.message} />
              </label>
              <label>
                <span>Изображение до 5 МБ</span>
                <input
                  data-testid="cafe-image"
                  {...register("image")}
                  type="file"
                  accept="image/*"
                />
              </label>
              <label className="check-field">
                <input
                  data-testid="cafe-active"
                  {...register("isActive")}
                  type="checkbox"
                />
                Доступно клиентам
              </label>
            </div>
            <button
              className="primary-button"
              data-testid="cafe-save"
              disabled={
                actions.uploadImage.isPending ||
                actions.createCafe.isPending ||
                actions.updateCafe.isPending
              }
            >
              Сохранить кафе
            </button>
          </form>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          dialogTestId="cafe-delete-dialog"
          titleId="cafe-delete-title"
          title="Удалить кафе?"
          description={`Кафе «${deleteTarget.name}» и его категории (${deleteTarget.categoryCount}) исчезнут из каталога.`}
          note="Если блюда уже есть в истории заказов, API откажет в удалении. Основное кафе Han tagam можно скрыть, но нельзя удалить."
          error={errorMessage(actions.deleteCafe.error) || undefined}
          isPending={actions.deleteCafe.isPending}
          cancelTestId="cafe-delete-cancel"
          confirmTestId="cafe-delete-confirm"
          onCancel={() => {
            actions.deleteCafe.reset();
            setDeleteTarget(null);
          }}
          onConfirm={() =>
            void actions.deleteCafe
              .mutateAsync(deleteTarget.id)
              .then(() => setDeleteTarget(null))
          }
        />
      )}
    </>
  );
}
