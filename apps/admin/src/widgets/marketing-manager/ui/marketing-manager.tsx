import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import {
  useAdminBanners,
  useAdminPromos,
  type Banner,
  type Promo,
} from "@/src/entities/marketing";
import { useMyAdminPageAccess } from "@/src/entities/admin-page-access";
import { useAdminCategories, useAdminProducts } from "@/src/entities/catalog";
import { useCatalogActions } from "@/src/features/catalog-management";
import { useMarketingActions } from "@/src/features/marketing-management";
import { resolveApiUrl } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import { FormFieldError, toIsoDateTime } from "@/src/shared/forms";
import {
  AsyncPanel,
  ConfirmDeleteDialog,
  DataTable,
  EditIcon,
  PowerIcon,
  TrashIcon,
} from "@/src/shared/ui";
import {
  bannerFormSchema,
  promoFormSchema,
  type BannerFormInput,
  type BannerFormValues,
  type PromoFormInput,
  type PromoFormValues,
} from "../model/marketing-forms";

function parseBannerTarget(link: string | null) {
  const match = link?.match(/^app:\/\/(product|category)\/([^/]+)$/);
  return match
    ? { type: match[1] as "product" | "category", id: match[2] }
    : { type: "external" as const, id: "" };
}

function imageFileFromDrop(event: { dataTransfer: DataTransfer }) {
  return Array.from(event.dataTransfer.files ?? []).find((file) =>
    file.type.startsWith("image/"),
  );
}

export function MarketingManager() {
  const { session } = useSession();
  const pageAccess = useMyAdminPageAccess();
  const banners = useAdminBanners();
  const promos = useAdminPromos();
  const marketing = useMarketingActions();
  const media = useCatalogActions();
  const categories = useAdminCategories();
  const products = useAdminProducts();
  const [bannerEdit, setBannerEdit] = useState<Banner | null>(null);
  const [bannerDelete, setBannerDelete] = useState<Banner | null>(null);
  const [promoEdit, setPromoEdit] = useState<Promo | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const [bannerTargetType, setBannerTargetType] = useState<"external" | "product" | "category">("external");
  const [bannerTargetId, setBannerTargetId] = useState("");
  const [selectedBannerFile, setSelectedBannerFile] = useState<File | null>(null);
  const [bannerDragOver, setBannerDragOver] = useState(false);
  const {
    register: registerBanner,
    handleSubmit: handleBannerSubmit,
    reset: resetBanner,
    setError: setBannerError,
    formState: { errors: bannerErrors },
  } = useForm<BannerFormInput, unknown, BannerFormValues>({
    resolver: zodResolver(bannerFormSchema),
    mode: "onBlur",
    defaultValues: {
      title: "",
      subtitle: "",
      link: "",
      sortOrder: 0,
      startsAt: "",
      endsAt: "",
      isActive: true,
    },
  });
  const {
    register: registerPromo,
    handleSubmit: handlePromoSubmit,
    reset: resetPromo,
    formState: { errors: promoErrors },
  } = useForm<PromoFormInput, unknown, PromoFormValues>({
    resolver: zodResolver(promoFormSchema),
    mode: "onBlur",
    defaultValues: {
      code: "",
      type: "PERCENT",
      value: 0,
      minOrderAmount: undefined,
      maxDiscountAmount: undefined,
      totalUsageLimit: undefined,
      perUserLimit: 1,
      startsAt: "",
      endsAt: "",
      isActive: true,
    },
  });
  const canEdit = Boolean(
    session &&
      (["ADMIN", "SUPER_ADMIN"].includes(session.user.role) ||
        pageAccess.data?.allowedPages.includes("MARKETING")),
  );

  const bannerColumns = useMemo<ColumnDef<Banner, unknown>[]>(
    () => [
      {
        header: "Баннер",
        cell: ({ row }) => (
          <div className="media-cell">
            <img
              src={resolveApiUrl(row.original.imageUrl)}
              alt=""
              loading="lazy"
              width={72}
              height={48}
            />
            <div className="primary-cell">
              <strong>{row.original.title}</strong>
              <small>{row.original.subtitle || "Без подзаголовка"}</small>
            </div>
          </div>
        ),
      },
      { header: "Порядок", accessorKey: "sortOrder" },
      {
        header: "Период",
        cell: ({ row }) => (
          <span className="muted">
            {row.original.startsAt
              ? new Date(row.original.startsAt).toLocaleDateString("ru-RU")
              : "сейчас"}{" "}
            —{" "}
            {row.original.endsAt
              ? new Date(row.original.endsAt).toLocaleDateString("ru-RU")
              : "без срока"}
          </span>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Показывается" : "Выключен"}
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
                aria-label="Изменить"
                title="Изменить"
                className="secondary-button compact row-icon-button"
                onClick={() => {
                  setBannerEdit(row.original);
                  const target = parseBannerTarget(row.original.link);
                  setBannerTargetType(target.type);
                  setBannerTargetId(target.id);
                  setSelectedBannerFile(null);
                  resetBanner({
                    title: row.original.title,
                    subtitle: row.original.subtitle ?? "",
                    link: row.original.link ?? "",
                    sortOrder: row.original.sortOrder,
                    startsAt: row.original.startsAt?.slice(0, 16) ?? "",
                    endsAt: row.original.endsAt?.slice(0, 16) ?? "",
                    isActive: row.original.isActive,
                  });
                  setShowBanner(true);
                }}
              >
                <EditIcon />
              </button>
              <button
                aria-label={row.original.isActive ? "Выключить" : "Включить"}
                title={row.original.isActive ? "Выключить" : "Включить"}
                className="text-button row-icon-button"
                data-testid={`banner-toggle-${row.original.id}`}
                disabled={marketing.updateBanner.isPending}
                type="button"
                onClick={() =>
                  marketing.updateBanner.mutate({
                    id: row.original.id,
                    body: { isActive: !row.original.isActive },
                  })
                }
              >
                <PowerIcon />
              </button>
              <button
                aria-label="Удалить"
                title="Удалить"
                className="danger-button compact row-icon-button"
                data-testid={`banner-delete-open-${row.original.id}`}
                disabled={marketing.deleteBanner.isPending}
                type="button"
                onClick={() => {
                  marketing.deleteBanner.reset();
                  setBannerDelete(row.original);
                }}
              >
                <TrashIcon />
              </button>
            </div>
          ),
      },
    ],
    [
      canEdit,
      marketing.deleteBanner,
      marketing.updateBanner,
      resetBanner,
    ],
  );

  const promoColumns = useMemo<ColumnDef<Promo, unknown>[]>(
    () => [
      {
        header: "Промокод",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong className="code-value">{row.original.code}</strong>
            <small>
              использован {row.original.usedCount}
              {row.original.totalUsageLimit
                ? ` / ${row.original.totalUsageLimit}`
                : " раз"}
            </small>
          </div>
        ),
      },
      {
        header: "Скидка",
        cell: ({ row }) =>
          row.original.type === "PERCENT"
            ? `${row.original.value}%`
            : `${row.original.value} TMT`,
      },
      {
        header: "Минимум",
        cell: ({ row }) =>
          row.original.minOrderAmount
            ? `${row.original.minOrderAmount} TMT`
            : "Нет",
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Активен" : "Выключен"}
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
                aria-label="Изменить"
                title="Изменить"
                className="secondary-button compact row-icon-button"
                onClick={() => {
                  setPromoEdit(row.original);
                  resetPromo({
                    code: row.original.code,
                    type: row.original.type,
                    value: Number(row.original.value),
                    minOrderAmount:
                      row.original.minOrderAmount === null
                        ? undefined
                        : Number(row.original.minOrderAmount),
                    maxDiscountAmount:
                      row.original.maxDiscountAmount === null
                        ? undefined
                        : Number(row.original.maxDiscountAmount),
                    totalUsageLimit: row.original.totalUsageLimit ?? undefined,
                    perUserLimit: row.original.perUserLimit,
                    startsAt: row.original.startsAt?.slice(0, 16) ?? "",
                    endsAt: row.original.endsAt?.slice(0, 16) ?? "",
                    isActive: row.original.isActive,
                  });
                  setShowPromo(true);
                }}
              >
                <EditIcon />
              </button>
              <button
                aria-label={row.original.isActive ? "Выключить" : "Включить"}
                title={row.original.isActive ? "Выключить" : "Включить"}
                className="text-button row-icon-button"
                onClick={() =>
                  marketing.updatePromo.mutate({
                    id: row.original.id,
                    body: {
                      perUserLimit: row.original.perUserLimit,
                      isActive: !row.original.isActive,
                    },
                  })
                }
              >
                <PowerIcon />
              </button>
            </div>
          ),
      },
    ],
    [canEdit, marketing.updatePromo, resetPromo],
  );

  async function submitBanner(values: BannerFormValues) {
    let imageUrl = bannerEdit?.imageUrl;
    if (selectedBannerFile) {
      imageUrl = (await media.uploadImage.mutateAsync(selectedBannerFile)).url;
    }
    if (!imageUrl) {
      setBannerError("image", { message: "Выберите изображение баннера" });
      return;
    }
    const body = {
      title: values.title,
      subtitle: values.subtitle,
      imageUrl,
      link: bannerTargetType === "external"
          ? values.link
          : bannerTargetId
          ? `app://${bannerTargetType}/${bannerTargetId}`
          : "",
      sortOrder: values.sortOrder,
      isActive: values.isActive,
      startsAt: toIsoDateTime(values.startsAt),
      endsAt: toIsoDateTime(values.endsAt),
    };
    if (bannerEdit) {
      await marketing.updateBanner.mutateAsync({
        id: bannerEdit.id,
        body,
      });
    } else {
      await marketing.createBanner.mutateAsync(body);
    }
    closeBannerEditor();
  }

  async function submitPromo(values: PromoFormValues) {
    const body = {
      ...values,
      startsAt: toIsoDateTime(values.startsAt),
      endsAt: toIsoDateTime(values.endsAt),
    };
    if (promoEdit) {
      await marketing.updatePromo.mutateAsync({
        id: promoEdit.id,
        body,
      });
    } else {
      await marketing.createPromo.mutateAsync(body);
    }
    closePromoEditor();
  }

  function closeBannerEditor() {
    setShowBanner(false);
    setBannerEdit(null);
    setSelectedBannerFile(null);
    setBannerDragOver(false);
    resetBanner();
  }

  function closePromoEditor() {
    setShowPromo(false);
    setPromoEdit(null);
    resetPromo();
  }

  async function deleteSelectedBanner() {
    if (!bannerDelete) return;
    try {
      await marketing.deleteBanner.mutateAsync(bannerDelete.id);
      if (bannerEdit?.id === bannerDelete.id) {
        setBannerEdit(null);
        setShowBanner(false);
        resetBanner();
      }
      setBannerDelete(null);
    } catch {
      // TanStack Mutation exposes the normalized API error in the dialog.
    }
  }

  const mutationError =
    marketing.createBanner.error ||
    marketing.updateBanner.error ||
    marketing.deleteBanner.error ||
    marketing.createPromo.error ||
    marketing.updatePromo.error ||
    media.uploadImage.error;

  return (
    <section
      className="admin-section marketing-section"
      data-testid="marketing-manager"
    >
      {mutationError && (
        <div className="inline-alert">
          {mutationError instanceof Error ? mutationError.message : ""}
        </div>
      )}

      {bannerDelete && (
        <ConfirmDeleteDialog
          className="marketing-delete-modal"
          dialogTestId="banner-delete-dialog"
          titleId="banner-delete-title"
          title="Удалить баннер?"
          description={`Баннер «${bannerDelete.title}» исчезнет из админки и клиентских приложений.`}
          note="Запись удаляется навсегда. Файл изображения останется в приватном хранилище и не удалит другие материалы."
          error={
            marketing.deleteBanner.error
              ? marketing.deleteBanner.error instanceof Error
                ? marketing.deleteBanner.error.message
                : "Не удалось удалить баннер"
              : undefined
          }
          isPending={marketing.deleteBanner.isPending}
          cancelTestId="banner-delete-cancel"
          confirmTestId="banner-delete-confirm"
          onCancel={() => {
            marketing.deleteBanner.reset();
            setBannerDelete(null);
          }}
          onConfirm={() => void deleteSelectedBanner()}
        />
      )}

      {showBanner && (
        <div
          className="modal-backdrop marketing-editor-backdrop"
          data-testid="banner-form-backdrop"
          onMouseDown={(event) => {
            if (
              !media.uploadImage.isPending &&
              !marketing.createBanner.isPending &&
              !marketing.updateBanner.isPending &&
              event.target === event.currentTarget
            ) {
              closeBannerEditor();
            }
          }}
        >
          <section
            aria-labelledby="banner-form-title"
            aria-modal="true"
            className="modal marketing-editor-modal"
            role="dialog"
          >
            <form
              className="marketing-editor"
              data-testid="banner-form"
              noValidate
              onSubmit={handleBannerSubmit(submitBanner)}
            >
              <header className="modal-head editor-title marketing-editor-title">
                <div>
                  <h2 id="banner-form-title">
                    {bannerEdit ? "Изменить баннер" : "Новый баннер"}
                  </h2>
                  <p>
                    Укажите текст, изображение и переход, который увидит
                    клиент в приложении.
                  </p>
                </div>
                <button
                  aria-label="Закрыть"
                  className="modal-close"
                  data-testid="banner-form-close"
                  disabled={
                    media.uploadImage.isPending ||
                    marketing.createBanner.isPending ||
                    marketing.updateBanner.isPending
                  }
                  type="button"
                  onClick={closeBannerEditor}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M6 6l8 8M14 6l-8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.9"
                    />
                  </svg>
                </button>
              </header>
              <div className="form-grid marketing-form-grid">
            <label>
              <span>Заголовок</span>
              <input
                data-testid="banner-title"
                {...registerBanner("title")}
                aria-invalid={Boolean(bannerErrors.title)}
                maxLength={160}
              />
              <FormFieldError message={bannerErrors.title?.message} />
            </label>
            <label>
              <span>Подзаголовок</span>
              <input
                data-testid="banner-subtitle"
                {...registerBanner("subtitle")}
                aria-invalid={Boolean(bannerErrors.subtitle)}
              />
              <FormFieldError message={bannerErrors.subtitle?.message} />
            </label>
            <label>
              <span>Переход</span>
              <select value={bannerTargetType} onChange={(event) => {
                setBannerTargetType(event.target.value as "external" | "product" | "category");
                setBannerTargetId("");
              }}>
                <option value="external">Внешняя ссылка</option>
                <option value="product">Открыть блюдо</option>
                <option value="category">Открыть категорию</option>
              </select>
            </label>
            {bannerTargetType === "external" ? <label>
              <span>Ссылка</span>
              <input
                data-testid="banner-link"
                {...registerBanner("link")}
                aria-invalid={Boolean(bannerErrors.link)}
              />
              <FormFieldError message={bannerErrors.link?.message} />
            </label> : <label className="wide-field">
              <span>{bannerTargetType === "product" ? "Блюдо" : "Категория"}</span>
              <select value={bannerTargetId} onChange={(event) => setBannerTargetId(event.target.value)}>
                <option value="">Выберите…</option>
                {bannerTargetType === "product"
                    ? (products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)
                    : (categories.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>}
            <label>
              <span>Порядок</span>
              <input
                data-testid="banner-sort-order"
                {...registerBanner("sortOrder", { valueAsNumber: true })}
                aria-invalid={Boolean(bannerErrors.sortOrder)}
                type="number"
              />
              <FormFieldError message={bannerErrors.sortOrder?.message} />
            </label>
            <label>
              <span>Начало</span>
              <input
                data-testid="banner-starts-at"
                {...registerBanner("startsAt")}
                aria-invalid={Boolean(bannerErrors.startsAt)}
                type="datetime-local"
              />
              <FormFieldError message={bannerErrors.startsAt?.message} />
            </label>
            <label>
              <span>Окончание</span>
              <input
                data-testid="banner-ends-at"
                {...registerBanner("endsAt")}
                aria-invalid={Boolean(bannerErrors.endsAt)}
                type="datetime-local"
              />
              <FormFieldError message={bannerErrors.endsAt?.message} />
            </label>
            <label className="wide-field">
              <span>Изображение до 5 МБ</span>
              <div
                className={
                  bannerDragOver
                    ? "product-file-picker is-dragging"
                    : "product-file-picker"
                }
                onDragOver={(event) => {
                  event.preventDefault();
                  setBannerDragOver(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setBannerDragOver(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setBannerDragOver(false);
                  const file = imageFileFromDrop(event);
                  if (!file) return;
                  setSelectedBannerFile(file);
                }}
              >
                <span>
                  {selectedBannerFile
                    ? selectedBannerFile.name
                    : "Выберите файл или перетащите сюда"}
                </span>
                <input
                  data-testid="banner-image"
                  aria-invalid={Boolean(bannerErrors.image)}
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setSelectedBannerFile(event.currentTarget.files?.item(0) ?? null)
                  }
                />
              </div>
              <FormFieldError message={bannerErrors.image?.message} />
            </label>
            <label className="check-field">
              <input
                data-testid="banner-active"
                {...registerBanner("isActive")}
                type="checkbox"
              />
              Показывать
            </label>
              </div>
              <footer className="marketing-form-actions">
                <p>Изменения сразу появятся у клиентов.</p>
                <div>
                  <button
                    className="secondary-button"
                    disabled={
                      media.uploadImage.isPending ||
                      marketing.createBanner.isPending ||
                      marketing.updateBanner.isPending
                    }
                    type="button"
                    onClick={closeBannerEditor}
                  >
                    Отмена
                  </button>
                  <button
                    className="primary-button"
                    data-testid="banner-save"
                    disabled={
                      media.uploadImage.isPending ||
                      marketing.createBanner.isPending ||
                      marketing.updateBanner.isPending
                    }
                  >
                    Сохранить баннер
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}

      {showPromo && (
        <div
          className="modal-backdrop marketing-editor-backdrop"
          data-testid="promo-form-backdrop"
          onMouseDown={(event) => {
            if (
              !marketing.createPromo.isPending &&
              !marketing.updatePromo.isPending &&
              event.target === event.currentTarget
            ) {
              closePromoEditor();
            }
          }}
        >
          <section
            aria-labelledby="promo-form-title"
            aria-modal="true"
            className="modal marketing-editor-modal"
            role="dialog"
          >
            <form
              className="marketing-editor"
              data-testid="promo-form"
              noValidate
              onSubmit={handlePromoSubmit(submitPromo)}
            >
              <header className="modal-head editor-title marketing-editor-title">
                <div>
                  <h2 id="promo-form-title">
                    {promoEdit ? "Изменить промокод" : "Новый промокод"}
                  </h2>
                  <p>
                    Настройте скидку, лимиты и период действия промокода.
                  </p>
                </div>
                <button
                  aria-label="Закрыть"
                  className="modal-close"
                  data-testid="promo-form-close"
                  disabled={
                    marketing.createPromo.isPending ||
                    marketing.updatePromo.isPending
                  }
                  type="button"
                  onClick={closePromoEditor}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M6 6l8 8M14 6l-8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.9"
                    />
                  </svg>
                </button>
              </header>
              <div className="form-grid marketing-form-grid">
            <label>
              <span>Код</span>
              <input
                data-testid="promo-code"
                {...registerPromo("code")}
                aria-invalid={Boolean(promoErrors.code)}
                maxLength={40}
              />
              <FormFieldError message={promoErrors.code?.message} />
            </label>
            <label>
              <span>Тип скидки</span>
              <select data-testid="promo-type" {...registerPromo("type")}>
                <option value="PERCENT">Процент</option>
                <option value="FIXED">Сумма TMT</option>
              </select>
              <FormFieldError message={promoErrors.type?.message} />
            </label>
            <label>
              <span>Значение</span>
              <input
                data-testid="promo-value"
                {...registerPromo("value", { valueAsNumber: true })}
                aria-invalid={Boolean(promoErrors.value)}
                type="number"
                min="0"
                step="0.01"
              />
              <FormFieldError message={promoErrors.value?.message} />
            </label>
            <label>
              <span>Минимум заказа</span>
              <input
                data-testid="promo-min-order"
                {...registerPromo("minOrderAmount", {
                  setValueAs: (value) =>
                    value === "" ? undefined : Number(value),
                })}
                aria-invalid={Boolean(promoErrors.minOrderAmount)}
                type="number"
                min="0"
                step="0.01"
              />
              <FormFieldError message={promoErrors.minOrderAmount?.message} />
            </label>
            <label>
              <span>Максимум скидки</span>
              <input
                data-testid="promo-max-discount"
                {...registerPromo("maxDiscountAmount", {
                  setValueAs: (value) =>
                    value === "" ? undefined : Number(value),
                })}
                aria-invalid={Boolean(promoErrors.maxDiscountAmount)}
                type="number"
                min="0"
                step="0.01"
              />
              <FormFieldError
                message={promoErrors.maxDiscountAmount?.message}
              />
            </label>
            <label>
              <span>Общий лимит</span>
              <input
                data-testid="promo-total-limit"
                {...registerPromo("totalUsageLimit", {
                  setValueAs: (value) =>
                    value === "" ? undefined : Number(value),
                })}
                aria-invalid={Boolean(promoErrors.totalUsageLimit)}
                type="number"
                min="1"
              />
              <FormFieldError message={promoErrors.totalUsageLimit?.message} />
            </label>
            <label>
              <span>На пользователя</span>
              <input
                data-testid="promo-user-limit"
                {...registerPromo("perUserLimit", { valueAsNumber: true })}
                aria-invalid={Boolean(promoErrors.perUserLimit)}
                type="number"
                min="1"
              />
              <FormFieldError message={promoErrors.perUserLimit?.message} />
            </label>
            <label>
              <span>Начало</span>
              <input
                data-testid="promo-starts-at"
                {...registerPromo("startsAt")}
                aria-invalid={Boolean(promoErrors.startsAt)}
                type="datetime-local"
              />
              <FormFieldError message={promoErrors.startsAt?.message} />
            </label>
            <label>
              <span>Окончание</span>
              <input
                data-testid="promo-ends-at"
                {...registerPromo("endsAt")}
                aria-invalid={Boolean(promoErrors.endsAt)}
                type="datetime-local"
              />
              <FormFieldError message={promoErrors.endsAt?.message} />
            </label>
            <label className="check-field">
              <input
                data-testid="promo-active"
                {...registerPromo("isActive")}
                type="checkbox"
              />
              Активен
            </label>
              </div>
              <footer className="marketing-form-actions">
                <p>Промокод можно отключить в любой момент.</p>
                <div>
                  <button
                    className="secondary-button"
                    disabled={
                      marketing.createPromo.isPending ||
                      marketing.updatePromo.isPending
                    }
                    type="button"
                    onClick={closePromoEditor}
                  >
                    Отмена
                  </button>
                  <button
                    className="primary-button"
                    data-testid="promo-save"
                    disabled={
                      marketing.createPromo.isPending ||
                      marketing.updatePromo.isPending
                    }
                  >
                    Сохранить промокод
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}

      <div className="split-tables marketing-workspace">
        <article className="table-card marketing-panel">
          <div className="card-title">
            <div>
              <h2>Баннеры</h2>
              <small>Главные предложения и переходы в приложении.</small>
            </div>
            <div className="marketing-panel-actions">
              <span className="marketing-panel-count">
                {banners.data?.length ?? 0}
              </span>
              {canEdit && (
                <button
                  className="secondary-button compact"
                  data-testid="banner-form-open"
                  type="button"
                  onClick={() => {
                    setBannerEdit(null);
                    setBannerTargetType("external");
                    setBannerTargetId("");
                    setSelectedBannerFile(null);
                    resetBanner();
                    setShowBanner(true);
                  }}
                >
                  + Баннер
                </button>
              )}
            </div>
          </div>
          <AsyncPanel
            pending={banners.isPending}
            error={banners.error}
            onRetry={() => void banners.refetch()}
          >
            <DataTable
              columns={bannerColumns}
              data={banners.data ?? []}
              getRowId={(banner) => banner.id}
              empty="Баннеров пока нет"
              label="Баннеры"
            />
          </AsyncPanel>
        </article>
        <article className="table-card marketing-panel">
          <div className="card-title">
            <div>
              <h2>Промокоды</h2>
              <small>Скидки и лимиты использования для заказов.</small>
            </div>
            <div className="marketing-panel-actions">
              <span className="marketing-panel-count">
                {promos.data?.length ?? 0}
              </span>
              {canEdit && (
                <button
                  className="primary-button compact"
                  data-testid="promo-form-open"
                  type="button"
                  onClick={() => {
                    setPromoEdit(null);
                    resetPromo();
                    setShowPromo(true);
                  }}
                >
                  + Промокод
                </button>
              )}
            </div>
          </div>
          <AsyncPanel
            pending={promos.isPending}
            error={promos.error}
            onRetry={() => void promos.refetch()}
          >
            <DataTable
              columns={promoColumns}
              data={promos.data ?? []}
              getRowId={(promo) => promo.id}
              empty="Промокодов пока нет"
              label="Промокоды"
            />
          </AsyncPanel>
        </article>
      </div>
    </section>
  );
}
