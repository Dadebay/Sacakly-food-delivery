import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { useAdminGifts, type Gift } from "@/src/entities/loyalty";
import { useLoyaltyActions } from "@/src/features/loyalty-management";
import { resolveApiUrl } from "@/src/shared/api/api-client";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import { giftFormSchema, type GiftFormInput, type GiftFormValues } from "../model/gift-form";

export function GiftManager({ canEdit }: { canEdit: boolean }) {
  const gifts = useAdminGifts();
  const actions = useLoyaltyActions();
  const [editing, setEditing] = useState<Gift | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const { register, handleSubmit, reset, formState: { errors } } = useForm<GiftFormInput, unknown, GiftFormValues>({
    resolver: zodResolver(giftFormSchema),
    mode: "onBlur",
    defaultValues: { name: "", description: "", pointsCost: 1, stock: "", sortOrder: 0, isActive: true },
  });
  const columns = useMemo<ColumnDef<Gift>[]>(() => [
    { accessorKey: "name", header: "Подарок", cell: ({ row }) => <div className="row-actions"><img src={resolveApiUrl(row.original.imageUrl)} alt="" width="52" height="52" loading="lazy" /> <span>{row.original.name}</span></div> },
    { accessorKey: "pointsCost", header: "Баллы" },
    { id: "stock", header: "Остаток", cell: ({ row }) => row.original.stock === null ? "Без лимита" : row.original.stock },
    { id: "status", header: "Статус", cell: ({ row }) => row.original.isActive ? "Показывается" : "Скрыт" },
    { id: "actions", header: "Действия", cell: ({ row }) => canEdit ? <button type="button" className="secondary-button compact" data-testid={`gift-edit-${row.original.id}`} onClick={() => {
      const gift = row.original;
      setEditing(gift);
      setImageFile(null);
      setMessage("");
      reset({ name: gift.name, description: gift.description, pointsCost: gift.pointsCost, stock: gift.stock?.toString() ?? "", sortOrder: gift.sortOrder, isActive: gift.isActive });
      setFormOpen(true);
    }}>Изменить</button> : null },
  ], [canEdit, reset]);
  const pending = actions.createGift.isPending || actions.updateGift.isPending || actions.uploadImage.isPending;
  const error = actions.createGift.error || actions.updateGift.error || actions.uploadImage.error;

  async function save(values: GiftFormValues) {
    setMessage("");
    if (!editing && !imageFile) { setMessage("Загрузите фото подарка"); return; }
    try {
      const imageUrl = imageFile ? (await actions.uploadImage.mutateAsync(imageFile)).url : editing!.imageUrl;
      const payload = { ...values, imageUrl };
      if (editing) await actions.updateGift.mutateAsync({ id: editing.id, body: { ...payload, version: editing.version } });
      else await actions.createGift.mutateAsync(payload);
      setFormOpen(false);
      setImageFile(null);
      setEditing(null);
      setMessage("Подарок сохранён");
    } catch {
      /* Mutation error is shown below the form. */
    }
  }

  return <section className="table-card" data-testid="gift-manager">
    <div className="card-title">
      <div><h2>Магазин подарков</h2><p>Подарок можно получить за баллы только вместе с доставкой еды.</p></div>
      {canEdit && <button type="button" className="primary-button" data-testid="gift-create-open" onClick={() => {
        setEditing(null); setImageFile(null); setMessage(""); actions.createGift.reset(); actions.updateGift.reset();
        reset({ name: "", description: "", pointsCost: 1, stock: "", sortOrder: 0, isActive: true }); setFormOpen(true);
      }}>+ Подарок</button>}
    </div>
    {message && <p className="inline-alert" role="status">{message}</p>}
    <AsyncPanel pending={gifts.isPending} error={gifts.error} onRetry={() => void gifts.refetch()}>
      <DataTable columns={columns} data={gifts.data ?? []} getRowId={(gift) => gift.id} empty="Подарков пока нет" label="Подарки" minWidth={560} />
    </AsyncPanel>
    {formOpen && canEdit && <form className="editor-card" data-testid="gift-form" noValidate onSubmit={handleSubmit(save)}>
      <div className="editor-title"><h3>{editing ? "Изменить подарок" : "Новый подарок"}</h3></div>
      <div className="form-grid">
        <label><span>Название</span><input data-testid="gift-name" {...register("name")} aria-invalid={Boolean(errors.name)} /><FormFieldError message={errors.name?.message} /></label>
        <label><span>Стоимость в баллах</span><input data-testid="gift-points-cost" type="number" min="1" {...register("pointsCost", { valueAsNumber: true })} aria-invalid={Boolean(errors.pointsCost)} /><FormFieldError message={errors.pointsCost?.message} /></label>
        <label><span>Остаток (пусто — без лимита)</span><input data-testid="gift-stock" inputMode="numeric" {...register("stock")} aria-invalid={Boolean(errors.stock)} /><FormFieldError message={errors.stock?.message} /></label>
        <label><span>Порядок</span><input data-testid="gift-sort-order" type="number" {...register("sortOrder", { valueAsNumber: true })} aria-invalid={Boolean(errors.sortOrder)} /><FormFieldError message={errors.sortOrder?.message} /></label>
        <label><span>Фото</span><input data-testid="gift-image" type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /></label>
        <label><span>Описание</span><textarea data-testid="gift-description" {...register("description")} aria-invalid={Boolean(errors.description)} /><FormFieldError message={errors.description?.message} /></label>
        <label><input data-testid="gift-active" type="checkbox" {...register("isActive")} /> Показывать клиентам</label>
      </div>
      {editing && !imageFile && <img src={resolveApiUrl(editing.imageUrl)} alt="Текущее фото подарка" width="96" height="96" loading="lazy" />}
      {error && <p className="inline-alert" role="alert">{error.message}</p>}
      <div className="row-actions"><button type="submit" className="primary-button" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button><button type="button" className="secondary-button" onClick={() => { setFormOpen(false); setImageFile(null); }}>Отмена</button></div>
    </form>}
  </section>;
}
