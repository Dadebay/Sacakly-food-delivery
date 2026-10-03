import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { useBranches } from "@/src/entities/branch";
import {
  inventoryQueryKeys,
  useInventoryIngredients,
} from "@/src/entities/inventory";
import { useSession } from "@/src/shared/auth";
import { FormFieldError } from "@/src/shared/forms";
import {
  flowDocumentFormSchema,
  locationFormSchema,
  parseDecimal,
  productLinkFormSchema,
  type FlowDocumentForm,
  type LocationForm,
  type ProductLinkForm,
} from "../model/inventory-flow-forms";
import "./inventory-flow.css";

type Location = components["schemas"]["InventoryLocationResponseDto"];
type Lot = components["schemas"]["InventoryLotResponseDto"];
type Document = components["schemas"]["InventoryDocumentResponseDto"];
type Trace = components["schemas"]["InventoryLotTraceResponseDto"];
type Link = components["schemas"]["InventoryProductLinkResponseDto"];
type DocumentKind = FlowDocumentForm["kind"];
const kindLabels: Record<DocumentKind, string> = {
  RECEIPT: "Приход партии",
  TRANSFER: "Передача в цех",
  PROCESS: "Переработка и отходы",
  WASTE: "Порча или бой",
  STOCKTAKE: "Инвентаризация",
};
const documentLabels: Record<string, string> = {
  ...kindLabels,
  ORDER_ISSUE: "Выдача заказа",
  LEGACY_ADJUSTMENT: "Переходный остаток / корректировка",
};
const unitLabels: Record<string, string> = {
  GRAM: "г",
  MILLILITER: "мл",
  PIECE: "шт.",
};
const json = (value: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

export function InventoryFlow() {
  const { session, authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const branches = useBranches();
  const ingredients = useInventoryIngredients();
  const [branchId, setBranchId] = useState("");
  const selectedBranchId = branchId || branches.data?.[0]?.id || "";
  const [traceId, setTraceId] = useState("");
  const [message, setMessage] = useState("");
  const userId = session?.user.id ?? "anonymous";
  const queryEnabled = Boolean(session && selectedBranchId);
  const locations = useQuery({
    queryKey: [
      ...inventoryQueryKeys.all,
      "flow-locations",
      userId,
      selectedBranchId,
    ],
    queryFn: ({ signal }) =>
      authorizedRequest<Location[]>(
        `/inventory/locations?branchId=${selectedBranchId}`,
        { signal },
      ),
    enabled: queryEnabled,
    staleTime: 15_000,
  });
  const lots = useQuery({
    queryKey: [
      ...inventoryQueryKeys.all,
      "flow-lots",
      userId,
      selectedBranchId,
    ],
    queryFn: ({ signal }) =>
      authorizedRequest<Lot[]>(`/inventory/lots?branchId=${selectedBranchId}`, {
        signal,
      }),
    enabled: queryEnabled,
    staleTime: 15_000,
  });
  const documents = useQuery({
    queryKey: [
      ...inventoryQueryKeys.all,
      "flow-documents",
      userId,
      selectedBranchId,
    ],
    queryFn: ({ signal }) =>
      authorizedRequest<Document[]>(
        `/inventory/documents?branchId=${selectedBranchId}`,
        { signal },
      ),
    enabled: queryEnabled,
    staleTime: 15_000,
  });
  const links = useQuery({
    queryKey: [...inventoryQueryKeys.all, "flow-links", userId],
    queryFn: ({ signal }) =>
      authorizedRequest<Link[]>("/inventory/product-links", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
  const trace = useQuery({
    queryKey: [...inventoryQueryKeys.all, "flow-trace", userId, traceId],
    queryFn: ({ signal }) =>
      authorizedRequest<Trace>(`/inventory/lots/${traceId}/trace`, { signal }),
    enabled: Boolean(session && traceId),
    staleTime: 15_000,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.all });
  const locationMutation = useMutation({
    mutationFn: (payload: components["schemas"]["InventoryLocationDto"]) =>
      authorizedRequest<Location>("/inventory/locations", json(payload)),
    onSuccess: () => refresh(),
  });
  const documentMutation = useMutation({
    mutationFn: ({ kind, payload }: { kind: DocumentKind; payload: object }) =>
      authorizedRequest<Document>(
        `/inventory/documents/${kind.toLowerCase()}`,
        json(payload),
      ),
    onSuccess: () => refresh(),
  });
  const linkMutation = useMutation({
    mutationFn: ({
      productId,
      payload,
    }: {
      productId: string;
      payload: components["schemas"]["InventoryProductLinkDto"];
    }) =>
      authorizedRequest<
        components["schemas"]["InventorySavedProductLinkResponseDto"]
      >(`/inventory/product-links/${productId}`, {
        ...json(payload),
        method: "PUT",
      }),
    onSuccess: () => refresh(),
  });
  const locationForm = useForm<LocationForm>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: { code: "", name: "" },
  });
  const linkForm = useForm<ProductLinkForm>({
    resolver: zodResolver(productLinkFormSchema),
    defaultValues: {
      productId: "",
      variantId: "",
      ingredientId: "",
      quantity: "1",
    },
  });
  const form = useForm<FlowDocumentForm>({
    resolver: zodResolver(flowDocumentFormSchema),
    defaultValues: {
      kind: "RECEIPT",
      ingredientId: "",
      lotId: "",
      locationId: "",
      toLocationId: "",
      outputIngredientId: "",
      outputLotCode: "",
      lotCode: "",
      quantity: "",
      outputQuantity: "",
      wasteQuantity: "0",
      unitCost: "",
      reason: "",
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const lotId = useWatch({ control: form.control, name: "lotId" });
  const chosenLot = lots.data?.find((lot) => lot.id === lotId);
  const chosenProductId = useWatch({
    control: linkForm.control,
    name: "productId",
  });
  const chosenProduct = links.data?.find(
    (link) => link.productId === chosenProductId,
  );
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  async function saveLocation(data: LocationForm) {
    if (!selectedBranchId) return;
    try {
      await locationMutation.mutateAsync({
        branchId: selectedBranchId,
        ...data,
      });
      locationForm.reset();
      setMessage("Место создано.");
    } catch {
      /* Mutation error remains visible under the form. */
    }
  }

  async function saveLink(data: ProductLinkForm) {
    try {
      await linkMutation.mutateAsync({
        productId: data.productId,
        payload: {
          ...(data.variantId ? { variantId: data.variantId } : {}),
          ...(data.ingredientId
            ? {
                ingredientId: data.ingredientId,
                quantity: parseDecimal(data.quantity),
              }
            : {}),
        },
      });
      setMessage(
        data.ingredientId
          ? "Прямая продажа связана со складом."
          : "Привязка удалена.",
      );
    } catch {
      /* Mutation error remains visible under the form. */
    }
  }

  async function saveDocument(data: FlowDocumentForm) {
    if (!selectedBranchId) return;
    const base = { branchId: selectedBranchId, reason: data.reason };
    const quantity = parseDecimal(data.quantity);
    let payload: object;
    if (data.kind === "RECEIPT")
      payload = {
        ...base,
        ingredientId: data.ingredientId,
        locationId: data.locationId,
        lotCode: data.lotCode,
        quantity,
        unitCost: parseDecimal(data.unitCost),
      };
    else if (data.kind === "TRANSFER")
      payload = {
        ...base,
        lotId: data.lotId,
        fromLocationId: data.locationId,
        toLocationId: data.toLocationId,
        quantity,
      };
    else if (data.kind === "PROCESS")
      payload = {
        ...base,
        inputs: [{ lotId: data.lotId, locationId: data.locationId, quantity }],
        outputs: [
          {
            ingredientId: data.outputIngredientId,
            locationId: data.locationId,
            lotCode: data.outputLotCode,
            quantity: parseDecimal(data.outputQuantity),
          },
        ],
        waste:
          parseDecimal(data.wasteQuantity) > 0
            ? [
                {
                  lotId: data.lotId,
                  locationId: data.locationId,
                  quantity: parseDecimal(data.wasteQuantity),
                },
              ]
            : [],
      };
    else if (data.kind === "WASTE")
      payload = {
        ...base,
        lines: [{ lotId: data.lotId, locationId: data.locationId, quantity }],
      };
    else
      payload = {
        ...base,
        lotId: data.lotId,
        locationId: data.locationId,
        countedQuantity: quantity,
      };
    const signature = JSON.stringify({ kind: data.kind, payload });
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    try {
      const saved = await documentMutation.mutateAsync({
        kind: data.kind,
        payload: { ...payload, idempotencyKey: attempt.current.key },
      });
      setMessage(`Документ ${saved.id} проведён.`);
      form.reset({
        ...data,
        quantity: "",
        reason: "",
        lotCode: "",
        outputLotCode: "",
      });
      attempt.current = null;
    } catch {
      /* Retain form and key for safe retry. */
    }
  }

  return (
    <section className="inventory-flow" data-testid="inventory-flow">
      <div className="inventory-view-head">
        <div>
          <h2>Партии и движение</h2>
          <p>
            Приход → передача в цех → обработка → отходы → выдача или списание.
          </p>
        </div>
      </div>
      <label className="flow-branch">
        Филиал{" "}
        <select
          data-testid="flow-branch"
          value={selectedBranchId}
          onChange={(event) => {
            setBranchId(event.target.value);
            setTraceId("");
          }}
        >
          {branches.data?.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>
      {branches.isPending && <p role="status">Загружаем филиалы…</p>}
      {branches.error && <p role="alert">{branches.error.message}</p>}
      {message && (
        <p role="status" className="inventory-notice">
          {message}
        </p>
      )}
      <div className="flow-grid">
        <article className="flow-card">
          <h3>Места хранения</h3>
          <p>Например, основной склад и холодный цех.</p>
          {locations.isPending && <p role="status">Загружаем места…</p>}
          {locations.error && (
            <p role="alert">
              {locations.error.message}{" "}
              <button type="button" onClick={() => void locations.refetch()}>
                Повторить
              </button>
            </p>
          )}
          <ul>
            {locations.data?.map((location) => (
              <li key={location.id}>
                {location.name} <small>{location.code}</small>
              </li>
            ))}
          </ul>
          {!locations.isPending && !locations.data?.length && (
            <p>Добавьте место, чтобы принять первую партию.</p>
          )}
          <form
            data-testid="flow-location-form"
            onSubmit={(event) =>
              void locationForm.handleSubmit(saveLocation)(event)
            }
            noValidate
          >
            <label>
              Код{" "}
              <input
                data-testid="flow-location-code"
                {...locationForm.register("code")}
                placeholder="KITCHEN"
              />
            </label>
            <FormFieldError
              message={locationForm.formState.errors.code?.message}
            />
            <label>
              Название{" "}
              <input
                data-testid="flow-location-name"
                {...locationForm.register("name")}
                placeholder="Холодный цех"
              />
            </label>
            <FormFieldError
              message={locationForm.formState.errors.name?.message}
            />
            <button
              data-testid="flow-location-save"
              type="submit"
              className="secondary-button"
              disabled={!selectedBranchId || locationMutation.isPending}
            >
              Добавить место
            </button>
            {locationMutation.error && (
              <p role="alert">{locationMutation.error.message}</p>
            )}
          </form>
        </article>
        <article className="flow-card">
          <h3>Товар без рецептуры</h3>
          <p>
            Одна продажа воды может резервировать одну бутылку. Для варианта
            можно указать другую норму.
          </p>
          {links.isPending && <p role="status">Загружаем товары…</p>}
          {links.error && (
            <p role="alert">
              {links.error.message}{" "}
              <button type="button" onClick={() => void links.refetch()}>
                Повторить
              </button>
            </p>
          )}
          <form
            data-testid="flow-product-link-form"
            onSubmit={(event) => void linkForm.handleSubmit(saveLink)(event)}
            noValidate
          >
            <label>
              Товар{" "}
              <select
                data-testid="flow-link-product"
                {...linkForm.register("productId")}
              >
                <option value="">Выберите товар</option>
                {links.data?.map((link) => (
                  <option key={link.productId} value={link.productId}>
                    {link.productName}
                  </option>
                ))}
              </select>
            </label>
            <FormFieldError
              message={linkForm.formState.errors.productId?.message}
            />
            {chosenProduct?.variants.length ? (
              <label>
                Вариант{" "}
                <select
                  data-testid="flow-link-variant"
                  {...linkForm.register("variantId")}
                >
                  <option value="">Все варианты по умолчанию</option>
                  {chosenProduct.variants.map((variant) => (
                    <option key={variant.variantId} value={variant.variantId}>
                      {variant.variantName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {chosenProduct && (
              <p>
                Сейчас:{" "}
                {chosenProduct.hasActiveRecipe
                  ? "активная рецептура"
                  : chosenProduct.ingredientId
                    ? `${ingredients.data?.find((item) => item.id === chosenProduct.ingredientId)?.name ?? "Позиция"} × ${chosenProduct.quantity}`
                    : "без привязки"}
              </p>
            )}
            <label>
              Складская позиция{" "}
              <select
                data-testid="flow-link-ingredient"
                {...linkForm.register("ingredientId")}
              >
                <option value="">Нет прямой привязки</option>
                {ingredients.data
                  ?.filter((item) => item.isActive)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({unitLabels[item.unit]})
                    </option>
                  ))}
              </select>
            </label>
            <FormFieldError
              message={linkForm.formState.errors.ingredientId?.message}
            />
            <label>
              Количество на одну продажу{" "}
              <input
                data-testid="flow-link-quantity"
                inputMode="decimal"
                {...linkForm.register("quantity")}
              />
            </label>
            <FormFieldError
              message={linkForm.formState.errors.quantity?.message}
            />
            <button
              data-testid="flow-link-save"
              type="submit"
              className="secondary-button"
              disabled={linkMutation.isPending || !chosenProduct}
            >
              Сохранить привязку
            </button>
            {linkMutation.error && (
              <p role="alert">{linkMutation.error.message}</p>
            )}
          </form>
        </article>
      </div>
      <div className="flow-grid">
        <article className="flow-card flow-entry">
          <h3>Провести документ</h3>
          <p>
            Количество вводится в базовых единицах: граммы, миллилитры или
            штуки. Ящик 12 бутылок × 2 = 24 шт.
          </p>
          <form
            data-testid="flow-document-form"
            onSubmit={(event) => void form.handleSubmit(saveDocument)(event)}
            noValidate
          >
            <label>
              Операция{" "}
              <select
                data-testid="flow-document-kind"
                {...form.register("kind")}
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {kind === "RECEIPT" ? (
              <>
                <label>
                  Позиция{" "}
                  <select
                    data-testid="flow-receipt-ingredient"
                    {...form.register("ingredientId")}
                  >
                    <option value="">Выберите</option>
                    {ingredients.data
                      ?.filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({unitLabels[item.unit]})
                        </option>
                      ))}
                  </select>
                </label>
                <FormFieldError
                  message={form.formState.errors.ingredientId?.message}
                />
                <label>
                  Партия поставщика{" "}
                  <input
                    data-testid="flow-receipt-lot-code"
                    {...form.register("lotCode")}
                    placeholder="Накладная / партия"
                  />
                </label>
                <FormFieldError
                  message={form.formState.errors.lotCode?.message}
                />
                <label>
                  Цена за базовую единицу{" "}
                  <input
                    data-testid="flow-receipt-unit-cost"
                    inputMode="decimal"
                    {...form.register("unitCost")}
                  />
                </label>
                <FormFieldError
                  message={form.formState.errors.unitCost?.message}
                />
              </>
            ) : (
              <>
                <label>
                  Партия{" "}
                  <select
                    data-testid="flow-document-lot"
                    {...form.register("lotId")}
                  >
                    <option value="">Выберите</option>
                    {lots.data
                      ?.filter(
                        (lot) =>
                          kind === "STOCKTAKE" ||
                          lot.balances.some((balance) => balance.quantity > 0),
                      )
                      .map((lot) => (
                        <option key={lot.id} value={lot.id}>
                          {lot.ingredientName} · {lot.code}
                        </option>
                      ))}
                  </select>
                </label>
                <FormFieldError
                  message={form.formState.errors.lotId?.message}
                />
                {chosenLot?.originNote && (
                  <p className="flow-warning">{chosenLot.originNote}</p>
                )}
              </>
            )}
            <label>
              {kind === "TRANSFER" ? "Откуда" : "Место"}{" "}
              <select
                data-testid="flow-document-location"
                {...form.register("locationId")}
              >
                <option value="">Выберите</option>
                {(kind === "RECEIPT"
                  ? locations.data?.map((location) => ({
                      locationId: location.id,
                      locationName: location.name,
                    }))
                  : chosenLot?.balances.filter(
                      (balance) => kind === "STOCKTAKE" || balance.quantity > 0,
                    )
                )?.map((location) => (
                  <option key={location.locationId} value={location.locationId}>
                    {location.locationName}
                  </option>
                ))}
              </select>
            </label>
            <FormFieldError
              message={form.formState.errors.locationId?.message}
            />
            {kind === "TRANSFER" && (
              <>
                <label>
                  Куда{" "}
                  <select
                    data-testid="flow-document-destination"
                    {...form.register("toLocationId")}
                  >
                    <option value="">Выберите</option>
                    {locations.data?.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </label>
                <FormFieldError
                  message={form.formState.errors.toLocationId?.message}
                />
              </>
            )}
            <label>
              {kind === "STOCKTAKE"
                ? "Фактически пересчитано"
                : kind === "PROCESS"
                  ? "Сырья взято"
                  : "Количество"}
              <input
                data-testid="flow-document-quantity"
                inputMode="decimal"
                {...form.register("quantity")}
              />
            </label>
            <FormFieldError message={form.formState.errors.quantity?.message} />
            {kind === "PROCESS" && (
              <>
                <label>
                  Полученная позиция{" "}
                  <select
                    data-testid="flow-process-output-ingredient"
                    {...form.register("outputIngredientId")}
                  >
                    <option value="">Выберите</option>
                    {ingredients.data
                      ?.filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({unitLabels[item.unit]})
                        </option>
                      ))}
                  </select>
                </label>
                <FormFieldError
                  message={form.formState.errors.outputIngredientId?.message}
                />
                <label>
                  Код новой партии{" "}
                  <input
                    data-testid="flow-process-output-lot"
                    {...form.register("outputLotCode")}
                  />
                </label>
                <FormFieldError
                  message={form.formState.errors.outputLotCode?.message}
                />
                <label>
                  Фактический выход{" "}
                  <input
                    data-testid="flow-process-output-quantity"
                    inputMode="decimal"
                    {...form.register("outputQuantity")}
                  />
                </label>
                <FormFieldError
                  message={form.formState.errors.outputQuantity?.message}
                />
                <label>
                  Измеренные отходы{" "}
                  <input
                    data-testid="flow-process-waste-quantity"
                    inputMode="decimal"
                    {...form.register("wasteQuantity")}
                  />
                </label>
                <FormFieldError
                  message={form.formState.errors.wasteQuantity?.message}
                />
                <p>
                  Для одной единицы: сырьё = выход + отходы. Порча после
                  обработки проводится отдельным списанием новой партии.
                </p>
              </>
            )}
            <label>
              Основание / причина{" "}
              <textarea
                data-testid="flow-document-reason"
                {...form.register("reason")}
                rows={2}
                placeholder="Накладная, передача, очистка или причина порчи"
              />
            </label>
            <FormFieldError message={form.formState.errors.reason?.message} />
            <button
              data-testid="flow-document-save"
              type="submit"
              className="primary-button"
              disabled={!selectedBranchId || documentMutation.isPending}
            >
              Провести
            </button>
            {documentMutation.error && (
              <p role="alert">{documentMutation.error.message}</p>
            )}
          </form>
        </article>
        <article className="flow-card">
          <h3>Физические партии (последние 500)</h3>
          <p>
            Остатки по местам. Резервы заказов уменьшают доступный остаток на
            вкладке «Остатки».
          </p>
          {lots.isPending && <p role="status">Загружаем партии…</p>}
          {lots.error && (
            <p role="alert">
              {lots.error.message}{" "}
              <button type="button" onClick={() => void lots.refetch()}>
                Повторить
              </button>
            </p>
          )}
          {!lots.isPending && !lots.data?.length && (
            <p>
              Пока нет партий. Проведите приход или сверьте переходный остаток.
            </p>
          )}
          <ul className="flow-lot-list">
            {lots.data?.map((lot) => (
              <li key={lot.id}>
                <button
                  data-testid={`flow-lot-${lot.id}`}
                  type="button"
                  className="text-button"
                  onClick={() => setTraceId(lot.id)}
                >
                  {lot.ingredientName} · {lot.code}
                </button>
                <small>
                  {lot.balances
                    .map(
                      (balance) =>
                        `${balance.locationName}: ${balance.quantity} ${unitLabels[lot.unit] ?? lot.unit}`,
                    )
                    .join(" · ")}
                </small>
                {lot.originNote && (
                  <small className="flow-warning">{lot.originNote}</small>
                )}
              </li>
            ))}
          </ul>
        </article>
      </div>
      <article className="flow-card" data-testid="flow-trace">
        <h3>Цепочка партии</h3>
        {!traceId && <p>Нажмите на партию выше или в строке документа.</p>}
        {trace.isPending && traceId && <p role="status">Строим цепочку…</p>}
        {trace.error && (
          <p role="alert">
            {trace.error.message}{" "}
            <button type="button" onClick={() => void trace.refetch()}>
              Повторить
            </button>
          </p>
        )}
        {trace.data && (
          <DocumentList documents={trace.data.documents} onLot={setTraceId} />
        )}
      </article>
      <article className="flow-card">
        <h3>Последние документы (100)</h3>
        {documents.isPending && <p role="status">Загружаем документы…</p>}
        {documents.error && (
          <p role="alert">
            {documents.error.message}{" "}
            <button type="button" onClick={() => void documents.refetch()}>
              Повторить
            </button>
          </p>
        )}
        {!documents.isPending && !documents.data?.length && (
          <p>Документов пока нет.</p>
        )}
        <DocumentList documents={documents.data ?? []} onLot={setTraceId} />
      </article>
    </section>
  );
}

function DocumentList({
  documents,
  onLot,
}: {
  documents: Document[];
  onLot: (id: string) => void;
}) {
  return (
    <div className="flow-documents">
      {documents.map((document) => (
        <details key={document.id}>
          <summary>
            {documentLabels[document.kind] ?? document.kind} ·{" "}
            {new Date(document.createdAt).toLocaleString("ru-RU")}
            {document.orderId && ` · заказ ${document.orderId.slice(0, 8)}`}
          </summary>
          <p>{document.reason}</p>
          {document.kind === "STOCKTAKE" &&
            document.stocktakeExpectedQuantity !== null &&
            document.stocktakeCountedQuantity !== null && (
              <p>
                По учёту: {document.stocktakeExpectedQuantity}; фактически:{" "}
                {document.stocktakeCountedQuantity}{" "}
                {unitLabels[document.lines[0]?.unit ?? ""] ??
                  document.lines[0]?.unit}
              </p>
            )}
          <ul>
            {document.lines.map((line) => (
              <li key={line.id}>
                <span>
                  {line.kind === "IN"
                    ? "+"
                    : line.kind === "PROCESS_WASTE"
                      ? "Отход "
                      : "−"}
                  {line.quantity} {unitLabels[line.unit] ?? line.unit} ·{" "}
                  {line.ingredientName} · {line.locationName}
                </span>
                <button
                  data-testid={`flow-document-lot-${line.id}`}
                  type="button"
                  className="text-button"
                  onClick={() => onLot(line.lotId)}
                >
                  {line.lotCode}
                </button>
                {line.orderItemId && (
                  <small>Строка заказа {line.orderItemId.slice(0, 8)}</small>
                )}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
