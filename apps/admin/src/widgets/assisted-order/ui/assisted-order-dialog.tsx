import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  filterOrderableProducts,
  groupProductsByCategory,
  useAdminProducts,
  type Product,
} from "@/src/entities/catalog";
import {
  useAssistedCustomerSearch,
  type AssistedCustomer,
  type AssistedCustomerAddress,
} from "@/src/entities/customer";
import {
  flattenDeliveryEtraps,
  useDeliveryConfig,
  useDeliveryQuote,
  useDeliveryTariffQuote,
} from "@/src/entities/delivery";
import {
  useGeocodeSearch,
  type GeocodeSearchResult,
} from "@/src/entities/geocoding";
import { type Order } from "@/src/entities/order";
import {
  type CreateAssistedOrderBody,
  useAssistedOrderActions,
} from "@/src/features/assisted-order";
import { ApiError, resolveApiUrl } from "@/src/shared/api/api-client";
import { FormFieldError } from "@/src/shared/forms";
import {
  assistedOrderFormSchema,
  type AssistedOrderCoordinates,
  type AssistedOrderFormInput,
  type AssistedOrderFormValues,
} from "../model/assisted-order-form";
import { buildAssistedOrderDeliverySelection } from "../model/assisted-order-delivery";
import {
  findExactAssistedCustomer,
  getPreferredAssistedAddress,
  toSavedAddressSelection,
} from "../model/assisted-customer-selection";

const AssistedOrderMapPicker = lazy(
  () => import("./assisted-order-map-picker"),
);

const ADDRESS_SEARCH_DEBOUNCE_MS = 350;

function customerName(customer: AssistedCustomer) {
  return (
    [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
    "Без имени"
  );
}

function mutationMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) {
    return "Данные клиента или заказа изменились. Проверьте выбор и повторите.";
  }
  return error instanceof Error ? error.message : "Не удалось создать заказ";
}

function activeVariants(product: Product) {
  return product.variants
    .filter(({ isActive }) => isActive)
    .sort(
      (left, right) =>
        left.price - right.price ||
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name),
    );
}

function selectionKey(productId: string, variantId?: string) {
  return `${productId}:${variantId ?? "base"}`;
}

type SelectedProductItem = {
  product: Product;
  variant: Product["variants"][number] | null;
  quantity: number;
};

export default function AssistedOrderDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const products = useAdminProducts();
  const deliveryConfig = useDeliveryConfig();
  const actions = useAssistedOrderActions();
  const [submittedCustomerPhone, setSubmittedCustomerPhone] = useState("");
  const [submittedAddressQuery, setSubmittedAddressQuery] = useState("");
  const [isAddressEditing, setIsAddressEditing] = useState(false);
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false);
  const [activeAddressResultIndex, setActiveAddressResultIndex] = useState(0);
  const [selectedAddressResult, setSelectedAddressResult] =
    useState<GeocodeSearchResult | null>(null);
  const [selectedLocationLabel, setSelectedLocationLabel] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<AssistedCustomer | null>(null);
  const [coordinates, setCoordinates] =
    useState<AssistedOrderCoordinates | null>(null);
  const [quantityBySelection, setQuantityBySelection] = useState<
    Record<string, number>
  >({});
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState<
    Record<string, string>
  >({});
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [customerSearchError, setCustomerSearchError] = useState("");
  const [addressSearchError, setAddressSearchError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const addressComboboxRef = useRef<HTMLDivElement>(null);
  const customers = useAssistedCustomerSearch();
  const addressResults = useGeocodeSearch(submittedAddressQuery);
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AssistedOrderFormInput, unknown, AssistedOrderFormValues>({
    resolver: zodResolver(assistedOrderFormSchema),
    mode: "onBlur",
    defaultValues: {
      customerPhone: "+993",
      customerFirstName: "",
      customerLastName: "",
      addressId: "",
      deliveryEtrapId: "",
      addressLabel: "По телефону",
      address: "",
      entrance: "",
      floor: "",
      apartment: "",
      customerNote: "",
      promoCode: "",
      addressSearch: "",
    },
  });
  const selectedAddressId = useWatch({ control, name: "addressId" });
  const selectedDeliveryEtrapId = useWatch({
    control,
    name: "deliveryEtrapId",
  });
  const addressSearchValue = useWatch({ control, name: "addressSearch" });
  const customerPhoneField = register("customerPhone");
  const addressSearchField = register("addressSearch");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    function closeAddressDropdown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !addressComboboxRef.current?.contains(event.target)
      ) {
        setIsAddressDropdownOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeAddressDropdown);
    return () =>
      document.removeEventListener("pointerdown", closeAddressDropdown);
  }, []);

  useEffect(() => {
    if (!isAddressEditing) return;
    const query = addressSearchValue.trim();
    if (query.length < 3) return;

    const timeout = window.setTimeout(() => {
      setAddressSearchError("");
      setActiveAddressResultIndex(0);
      setSubmittedAddressQuery(query);
      setIsAddressDropdownOpen(true);
    }, ADDRESS_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [addressSearchValue, isAddressEditing]);

  const visibleProducts = useMemo(() => {
    return filterOrderableProducts(products.data ?? [], {
      categoryId: productCategoryFilter,
      query: productSearch,
    });
  }, [productCategoryFilter, productSearch, products.data]);
  const activeProductGroups = useMemo(
    () => groupProductsByCategory(filterOrderableProducts(products.data ?? [])),
    [products.data],
  );
  const visibleProductGroups = useMemo(
    () => groupProductsByCategory(visibleProducts),
    [visibleProducts],
  );

  const selectedItems = useMemo<SelectedProductItem[]>(() => {
    const items: SelectedProductItem[] = [];
    for (const product of products.data ?? []) {
      const variants = activeVariants(product);
      if (product.pricingType === "FIXED") {
        const quantity = quantityBySelection[selectionKey(product.id)] ?? 0;
        if (quantity > 0) items.push({ product, variant: null, quantity });
        continue;
      }
      for (const variant of variants) {
        const quantity =
          quantityBySelection[selectionKey(product.id, variant.id)] ?? 0;
        if (quantity > 0) items.push({ product, variant, quantity });
      }
    }
    return items;
  }, [products.data, quantityBySelection]);
  const estimatedSubtotal = selectedItems.reduce(
    (sum, item) =>
      sum + (item.variant?.price ?? item.product.price) * item.quantity,
    0,
  );
  const deliveryQuote = useDeliveryQuote(
    coordinates?.latitude ?? null,
    coordinates?.longitude ?? null,
    estimatedSubtotal,
    !selectedAddressId,
  );
  const deliveryEtraps = useMemo(
    () => flattenDeliveryEtraps(deliveryConfig.data),
    [deliveryConfig.data],
  );
  const selectedDeliveryEtrap = deliveryEtraps.find(
    (etrap) => etrap.id === Number(selectedDeliveryEtrapId),
  );
  const selectedSavedAddress = selectedCustomer?.addresses.find(
    (address) => address.id === selectedAddressId,
  );
  const suggestedDeliveryEtrap = deliveryQuote.data?.etrap ?? null;
  const savedAddressQuote = useDeliveryTariffQuote(
    selectedSavedAddress?.deliveryEtrapId ?? null,
    estimatedSubtotal,
    Boolean(selectedSavedAddress),
  );
  const activeDeliveryQuote = selectedAddressId ? savedAddressQuote : deliveryQuote;
  const estimatedDeliveryFee = activeDeliveryQuote.data?.fee ?? null;
  const estimatedTotal =
    estimatedDeliveryFee === null
      ? null
      : estimatedSubtotal + estimatedDeliveryFee;

  useEffect(() => {
    if (
      selectedAddressId ||
      selectedDeliveryEtrapId ||
      !suggestedDeliveryEtrap
    ) {
      return;
    }
    setValue("deliveryEtrapId", String(suggestedDeliveryEtrap.id), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [
    selectedAddressId,
    selectedDeliveryEtrapId,
    setValue,
    suggestedDeliveryEtrap,
  ]);

  function changeQuantity(
    productId: string,
    variantId: string | undefined,
    delta: number,
  ) {
    const key = selectionKey(productId, variantId);
    setQuantityBySelection((current) => {
      const next = Math.max(0, Math.min(50, (current[key] ?? 0) + delta));
      if (next === 0) {
        const nextQuantities = { ...current };
        delete nextQuantities[key];
        return nextQuantities;
      }
      return { ...current, [key]: next };
    });
    setSelectionError("");
  }

  const clearSelectedAddress = useCallback(() => {
    setValue("addressId", "");
    setValue("deliveryEtrapId", "");
    setValue("addressLabel", "По телефону");
    setValue("address", "");
    setValue("entrance", "");
    setValue("floor", "");
    setValue("apartment", "");
    setCoordinates(null);
    setSelectedAddressResult(null);
    setSelectedLocationLabel("");
    setIsAddressEditing(false);
  }, [setValue]);

  const selectAddress = useCallback(
    (address: AssistedCustomerAddress) => {
      const selection = toSavedAddressSelection(address);
      setValue("addressId", selection.values.addressId, {
        shouldValidate: true,
      });
      setValue("deliveryEtrapId", selection.values.deliveryEtrapId, {
        shouldValidate: true,
      });
      setValue("addressLabel", selection.values.addressLabel);
      setValue("address", "", { shouldValidate: true });
      setValue("entrance", selection.values.entrance);
      setValue("floor", selection.values.floor);
      setValue("apartment", selection.values.apartment);
      setCoordinates(selection.coordinates);
      setSelectedAddressResult(null);
      setSelectedLocationLabel(address.address);
      setIsAddressEditing(false);
      setIsAddressDropdownOpen(false);
      setSelectionError("");
    },
    [setValue],
  );

  const selectCustomer = useCallback(
    (customer: AssistedCustomer) => {
      setSelectedCustomer(customer);
      setValue("customerPhone", customer.phone, { shouldValidate: true });
      setValue("customerFirstName", customer.firstName ?? "");
      setValue("customerLastName", customer.lastName ?? "");
      const preferredAddress = getPreferredAssistedAddress(customer);
      if (preferredAddress) selectAddress(preferredAddress);
      else clearSelectedAddress();
    },
    [clearSelectedAddress, selectAddress, setValue],
  );

  function selectSearchResult(result: GeocodeSearchResult) {
    setValue("addressId", "", { shouldValidate: true });
    setValue("deliveryEtrapId", "", { shouldValidate: true });
    setValue("addressSearch", result.label, { shouldValidate: true });
    setSelectedAddressResult(result);
    setSelectedLocationLabel(result.label);
    setCoordinates({
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setIsAddressEditing(false);
    setIsAddressDropdownOpen(false);
    setSelectionError("");
  }

  async function findCustomer() {
    const phone = getValues("customerPhone").trim();
    if (phone.replace(/\D/g, "").length < 4) {
      setCustomerSearchError("Введите хотя бы 4 цифры номера");
      return;
    }
    setCustomerSearchError("");
    customers.reset();
    setSelectedCustomer(null);
    clearSelectedAddress();
    setSubmittedCustomerPhone(phone);
    try {
      const result = await customers.mutateAsync(phone);
      const exactCustomer = findExactAssistedCustomer(result.items, phone);
      if (exactCustomer) selectCustomer(exactCustomer);
    } catch {
      // TanStack Query owns the normalized search error rendered below.
    }
  }

  function editCustomerPhone(event: ChangeEvent<HTMLInputElement>) {
    void customerPhoneField.onChange(event);
    if (!selectedCustomer && !submittedCustomerPhone) return;
    setSelectedCustomer(null);
    setSubmittedCustomerPhone("");
    customers.reset();
    clearSelectedAddress();
  }

  function findAddress() {
    const query = getValues("addressSearch").trim();
    if (query.length < 3) {
      setAddressSearchError("Введите минимум 3 символа");
      return;
    }
    setIsAddressEditing(true);
    setAddressSearchError("");
    setActiveAddressResultIndex(0);
    setIsAddressDropdownOpen(true);
    if (query === submittedAddressQuery) {
      void addressResults.refetch();
      return;
    }
    setSubmittedAddressQuery(query);
  }

  function editAddressSearch(event: ChangeEvent<HTMLInputElement>) {
    void addressSearchField.onChange(event);
    if (event.target.value.trim().length < 3) setSubmittedAddressQuery("");
    setValue("addressId", "", { shouldValidate: true });
    setValue("deliveryEtrapId", "", { shouldValidate: true });
    setIsAddressEditing(true);
    setIsAddressDropdownOpen(false);
    setAddressSearchError("");
  }

  function startAddressSearch() {
    const currentAddress =
      selectedLocationLabel ||
      selectedSavedAddress?.address ||
      deliveryQuote.data?.addressLine ||
      selectedAddressResult?.label;
    if (currentAddress) {
      setValue("addressSearch", currentAddress, { shouldValidate: true });
    }
    setIsAddressEditing(true);
    setIsAddressDropdownOpen(false);
    setAddressSearchError("");
  }

  function keepCurrentCoordinates() {
    setIsAddressEditing(false);
    setIsAddressDropdownOpen(false);
    setAddressSearchError("");
  }

  function handleAddressSearchKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) {
    const results = addressResults.data?.items ?? [];
    if (event.key === "Escape" && isAddressDropdownOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsAddressDropdownOpen(false);
      return;
    }
    if (event.key === "ArrowDown" && isAddressDropdownOpen && results.length) {
      event.preventDefault();
      setActiveAddressResultIndex((current) =>
        Math.min(results.length - 1, current + 1),
      );
      return;
    }
    if (event.key === "ArrowUp" && isAddressDropdownOpen && results.length) {
      event.preventDefault();
      setActiveAddressResultIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (isAddressDropdownOpen && results[activeAddressResultIndex]) {
      selectSearchResult(results[activeAddressResultIndex]);
      return;
    }
    findAddress();
  }

  function selectMapCoordinates(next: AssistedOrderCoordinates) {
    setValue("addressId", "", { shouldValidate: true });
    setValue("deliveryEtrapId", "", { shouldValidate: true });
    setCoordinates(next);
    setSelectedAddressResult(null);
    setSelectedLocationLabel("");
    setIsAddressEditing(false);
    setIsAddressDropdownOpen(false);
    setSelectionError("");
  }

  async function submit(values: AssistedOrderFormValues) {
    if (!selectedItems.length) {
      setSelectionError("Добавьте хотя бы одно блюдо");
      return;
    }
    if (!values.addressId && !coordinates) {
      setSelectionError("Поставьте маркер адреса доставки на карте");
      return;
    }

    const deliverySelection = buildAssistedOrderDeliverySelection({
      values,
      coordinates,
      savedAddress: selectedSavedAddress,
      officialAddress:
        deliveryQuote.data?.addressLine ||
        selectedLocationLabel ||
        selectedAddressResult?.label,
    });
    if (!deliverySelection) {
      setSelectionError("Поставьте маркер адреса доставки на карте");
      return;
    }

    const body = {
      customerPhone: values.customerPhone,
      customerFirstName: values.customerFirstName,
      customerLastName: values.customerLastName,
      items: selectedItems.map(({ product, variant, quantity }) => ({
        productId: product.id,
        ...(variant ? { variantId: variant.id } : {}),
        quantity,
      })),
      ...deliverySelection,
      customerNote: values.customerNote,
      promoCode: values.promoCode,
    } satisfies CreateAssistedOrderBody;

    try {
      const created = await actions.create.mutateAsync(body);
      setCreatedOrder(created);
    } catch {
      // TanStack Query owns the normalized mutation error rendered below.
    }
  }

  function startAnotherOrder() {
    actions.create.reset();
    setCreatedOrder(null);
    setSelectedCustomer(null);
    setSubmittedCustomerPhone("");
    setSubmittedAddressQuery("");
    setIsAddressEditing(false);
    setIsAddressDropdownOpen(false);
    setSelectedAddressResult(null);
    setCoordinates(null);
    setQuantityBySelection({});
    setSelectedVariantByProduct({});
    setProductSearch("");
    setSelectionError("");
    reset();
  }

  if (createdOrder) {
    return (
      <div className="modal-backdrop assisted-order-backdrop">
        <section
          aria-labelledby="assisted-order-success-title"
          aria-modal="true"
          className="modal assisted-order-modal assisted-order-success"
          role="dialog"
        >
          <span className="success-mark" aria-hidden="true">
            ✓
          </span>
          <h2 id="assisted-order-success-title">
            Заказ #{createdOrder.number} создан
          </h2>
          <p>
            Ближайший филиал: <strong>{createdOrder.branchName}</strong>. Сумма:{" "}
            <strong>{createdOrder.total.toFixed(2)} TMT</strong> наличными.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              data-testid="assisted-order-success-close"
              type="button"
              onClick={onClose}
            >
              Закрыть
            </button>
            <button
              className="primary-button"
              data-testid="assisted-order-success-another"
              type="button"
              onClick={startAnotherOrder}
            >
              Ещё заказ
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      aria-labelledby="assisted-order-title"
      aria-modal="true"
      className="modal-backdrop assisted-order-backdrop"
      role="dialog"
    >
      <form
        className="modal assisted-order-modal"
        data-testid="assisted-order-form"
        noValidate
        onSubmit={handleSubmit(submit)}
      >
        <header className="modal-head assisted-order-head">
          <div>
            <span className="eyebrow">ЗАКАЗ ПО ЗВОНКУ</span>
            <h2 id="assisted-order-title">Создать заказ за клиента</h2>
            <p>
              Наличная оплата. Backend сам выберет ближайший активный филиал.
            </p>
          </div>
          <button
            aria-label="Закрыть"
            data-testid="assisted-order-close"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="assisted-order-layout">
          <div className="assisted-order-column">
            <section className="assisted-order-card">
              <div className="assisted-order-section-title">
                <div>
                  <span>1</span>
                  <strong>Клиент</strong>
                </div>
                {selectedCustomer && (
                  <small>{customerName(selectedCustomer)}</small>
                )}
              </div>
              <div className="assisted-customer-search">
                <label>
                  <span>Телефон</span>
                  <input
                    data-testid="assisted-order-phone"
                    {...customerPhoneField}
                    aria-invalid={Boolean(errors.customerPhone)}
                    onChange={editCustomerPhone}
                    type="tel"
                    placeholder="+99365123456"
                  />
                  <FormFieldError message={errors.customerPhone?.message} />
                </label>
                <button
                  className="secondary-button"
                  data-testid="assisted-customer-search"
                  type="button"
                  onClick={findCustomer}
                >
                  Найти клиента
                </button>
              </div>
              {customerSearchError && (
                <p className="form-error">{customerSearchError}</p>
              )}
              {customers.isPending && <p className="muted">Ищем по номеру…</p>}
              {customers.isError && (
                <p className="form-error">{customers.error.message}</p>
              )}
              {customers.data && !customers.data.items.length && (
                <p className="assisted-order-hint">
                  Клиент не найден. Он будет безопасно создан при оформлении без
                  выдачи сессии или OTP.
                </p>
              )}
              {customers.data && customers.data.items.length > 0 && (
                <div
                  className="assisted-search-results"
                  data-testid="assisted-customer-results"
                >
                  {customers.data.items.map((customer) => (
                    <button
                      className={
                        selectedCustomer?.id === customer.id ? "selected" : ""
                      }
                      data-testid={`assisted-customer-result-${customer.id}`}
                      key={customer.id}
                      type="button"
                      onClick={() => selectCustomer(customer)}
                    >
                      <strong>{customerName(customer)}</strong>
                      <small>
                        {customer.phone} · адресов: {customer.addresses.length}
                      </small>
                    </button>
                  ))}
                </div>
              )}
              {selectedCustomer?.addresses.length ? (
                <p
                  className="assisted-order-hint"
                  data-testid="assisted-saved-address-hint"
                >
                  Клиент найден. Активный или последний использованный адрес
                  подставлен автоматически; ниже можно выбрать другой.
                </p>
              ) : null}
              <div className="modal-grid assisted-name-grid">
                <label>
                  <span>Имя (необязательно)</span>
                  <input
                    data-testid="assisted-order-first-name"
                    {...register("customerFirstName")}
                    maxLength={80}
                  />
                  <FormFieldError message={errors.customerFirstName?.message} />
                </label>
                <label>
                  <span>Фамилия (необязательно)</span>
                  <input
                    data-testid="assisted-order-last-name"
                    {...register("customerLastName")}
                    maxLength={80}
                  />
                  <FormFieldError message={errors.customerLastName?.message} />
                </label>
              </div>
              {selectedCustomer?.addresses.length ? (
                <label>
                  <span>Сохранённый адрес</span>
                  <select
                    data-testid="assisted-saved-address"
                    value={selectedAddressId ?? ""}
                    onChange={(event) => {
                      const address = selectedCustomer.addresses.find(
                        (item) => item.id === event.target.value,
                      );
                      if (address) selectAddress(address);
                      else clearSelectedAddress();
                    }}
                  >
                    <option value="">Новый адрес через карту</option>
                    {selectedCustomer.addresses.map((address) => (
                      <option value={address.id} key={address.id}>
                        {address.isActive ? "Активный · " : ""}
                        {address.label ? `${address.label} · ` : ""}
                        {address.address}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>

            <section className="assisted-order-card assisted-products-card">
              <div className="assisted-order-section-title">
                <div>
                  <span>2</span>
                  <strong>Блюда</strong>
                </div>
                <small>
                  {selectedItems.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                  шт.
                </small>
              </div>
              <input
                aria-label="Поиск блюда"
                className="assisted-product-search"
                data-testid="assisted-product-search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Найти блюдо или категорию"
                type="search"
              />
              <div
                aria-label="Фильтр блюд по категории"
                className="assisted-product-categories"
                data-testid="assisted-product-categories"
                role="group"
              >
                <button
                  aria-pressed={!productCategoryFilter}
                  className={!productCategoryFilter ? "active" : ""}
                  data-testid="assisted-product-category-all"
                  onClick={() => setProductCategoryFilter("")}
                  type="button"
                >
                  Все
                </button>
                {activeProductGroups.map((group) => (
                  <button
                    aria-pressed={productCategoryFilter === group.id}
                    className={
                      productCategoryFilter === group.id ? "active" : ""
                    }
                    data-testid={`assisted-product-category-${group.id}`}
                    key={group.id}
                    onClick={() => setProductCategoryFilter(group.id)}
                    type="button"
                  >
                    {group.name} <span>{group.products.length}</span>
                  </button>
                ))}
              </div>
              {products.isPending && <p className="muted">Загружаем меню…</p>}
              {products.isError && (
                <p className="form-error">{products.error.message}</p>
              )}
              <div
                className="assisted-product-list"
                data-testid="assisted-product-groups"
              >
                {visibleProductGroups.map((group) => (
                  <section
                    className="assisted-product-group"
                    data-testid={`assisted-product-group-${group.id}`}
                    key={group.id}
                  >
                    <header>
                      <strong>{group.name}</strong>
                      <span>{group.products.length}</span>
                    </header>
                    <div>
                      {group.products.map((product) => {
                        const variants = activeVariants(product);
                        const requiresVariant =
                          product.pricingType === "VARIANT";
                        const selectedVariant =
                          variants.find(
                            ({ id }) =>
                              selectedVariantByProduct[product.id] === id,
                          ) ?? null;
                        const currentSelectionKey = selectionKey(
                          product.id,
                          selectedVariant?.id,
                        );
                        const quantity =
                          quantityBySelection[currentSelectionKey] ?? 0;
                        const selectedVariantItems = variants.filter(
                          ({ id }) =>
                            (quantityBySelection[
                              selectionKey(product.id, id)
                            ] ?? 0) > 0,
                        );
                        const displayImageUrl =
                          selectedVariant?.images[0]?.url ??
                          product.displayImageUrl;
                        return (
                          <article
                            className={
                              selectedVariantItems.length || quantity
                                ? "selected"
                                : ""
                            }
                            key={product.id}
                          >
                            {displayImageUrl ? (
                              <img
                                alt={selectedVariant?.name ?? product.name}
                                height="52"
                                loading="lazy"
                                src={resolveApiUrl(displayImageUrl)}
                                width="52"
                              />
                            ) : (
                              <span
                                className="product-image-placeholder"
                                aria-hidden="true"
                              >
                                🍽
                              </span>
                            )}
                            <div>
                              <strong>{product.name}</strong>
                              <small>
                                {product.category?.name ?? "Без категории"}
                              </small>
                              {requiresVariant && (
                                <label className="assisted-product-variant">
                                  <span>
                                    {product.variantLabel ?? "Вариант"}
                                  </span>
                                  <select
                                    data-testid={`assisted-product-variant-${product.id}`}
                                    value={selectedVariant?.id ?? ""}
                                    onChange={(event) =>
                                      setSelectedVariantByProduct(
                                        (current) => ({
                                          ...current,
                                          [product.id]: event.target.value,
                                        }),
                                      )
                                    }
                                  >
                                    <option value="" disabled>
                                      Выберите вариант
                                    </option>
                                    {variants.map((variant) => (
                                      <option
                                        key={variant.id}
                                        value={variant.id}
                                      >
                                        {variant.name} —{" "}
                                        {variant.price.toFixed(2)} TMT
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              <b>
                                {requiresVariant && !selectedVariant
                                  ? "от "
                                  : ""}
                                {(
                                  selectedVariant?.price ?? product.minPrice
                                ).toFixed(2)}{" "}
                                TMT
                              </b>
                              {selectedVariantItems.length > 0 && (
                                <small className="assisted-selected-variants">
                                  Добавлено:{" "}
                                  {selectedVariantItems
                                    .map(
                                      (variant) =>
                                        `${variant.name} ×${quantityBySelection[selectionKey(product.id, variant.id)]}`,
                                    )
                                    .join(", ")}
                                </small>
                              )}
                            </div>
                            <div
                              className="quantity-stepper"
                              aria-label={`Количество ${product.name}`}
                              role="group"
                            >
                              <button
                                data-testid={`assisted-product-minus-${product.id}`}
                                type="button"
                                disabled={requiresVariant && !selectedVariant}
                                onClick={() =>
                                  changeQuantity(
                                    product.id,
                                    selectedVariant?.id,
                                    -1,
                                  )
                                }
                              >
                                −
                              </button>
                              <output>{quantity}</output>
                              <button
                                data-testid={`assisted-product-plus-${product.id}`}
                                type="button"
                                disabled={requiresVariant && !selectedVariant}
                                onClick={() =>
                                  changeQuantity(
                                    product.id,
                                    selectedVariant?.id,
                                    1,
                                  )
                                }
                              >
                                +
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {!products.isPending && !visibleProducts.length && (
                <p className="assisted-order-hint">
                  Подходящих активных блюд нет.
                </p>
              )}
              <div className="assisted-order-total">
                <span>Предварительно без скидки</span>
                <strong>{estimatedSubtotal.toFixed(2)} TMT</strong>
              </div>
            </section>
          </div>

          <div className="assisted-order-column">
            <section
              className="assisted-order-card assisted-address-card"
              data-testid="assisted-address-workflow"
            >
              <div className="assisted-order-section-title">
                <div>
                  <span>3</span>
                  <strong>Адрес доставки</strong>
                </div>
              </div>
              <p className="assisted-order-hint">
                Найдите улицу вместе с номером дома и выберите вариант — после
                этого маркер переместится. Если нужного дома нет, укажите точку
                прямо на карте.
              </p>
              {(!coordinates || isAddressEditing) && (
                <section
                  className="assisted-address-search-panel"
                  data-testid="assisted-address-search-panel"
                >
                  <div className="assisted-address-stage-heading">
                    <div>
                      <strong>Найдите улицу или дом</strong>
                      <small>
                        Введите улицу и номер дома, затем выберите один вариант
                        ниже.
                      </small>
                    </div>
                    {coordinates && (
                      <button
                        className="text-button compact"
                        data-testid="assisted-address-search-cancel"
                        type="button"
                        onClick={keepCurrentCoordinates}
                      >
                        Оставить текущую точку
                      </button>
                    )}
                  </div>
                  <div
                    className="assisted-address-combobox"
                    data-testid="assisted-address-combobox"
                    ref={addressComboboxRef}
                  >
                    <div className="assisted-address-search">
                      <label>
                        <span>Улица, дом или известное место</span>
                        <input
                          {...addressSearchField}
                          aria-autocomplete="list"
                          aria-controls={
                            isAddressDropdownOpen
                              ? "assisted-address-listbox"
                              : undefined
                          }
                          aria-expanded={isAddressDropdownOpen}
                          aria-haspopup="listbox"
                          aria-activedescendant={
                            isAddressDropdownOpen &&
                            addressResults.data?.items[activeAddressResultIndex]
                              ? `assisted-address-option-${activeAddressResultIndex}`
                              : undefined
                          }
                          data-testid="assisted-address-search-input"
                          onChange={editAddressSearch}
                          onFocus={() => {
                            if (
                              addressResults.data &&
                              getValues("addressSearch").trim() ===
                                submittedAddressQuery
                            ) {
                              setIsAddressDropdownOpen(true);
                            }
                          }}
                          onKeyDown={handleAddressSearchKeyDown}
                          placeholder="Например: Garaşsyzlyk şaýoly 60"
                          role="combobox"
                        />
                        <FormFieldError
                          message={errors.addressSearch?.message}
                        />
                      </label>
                      <button
                        className="secondary-button"
                        data-testid="assisted-address-search-submit"
                        type="button"
                        onClick={findAddress}
                      >
                        Найти
                      </button>
                    </div>
                    {addressSearchError && (
                      <p className="form-error">{addressSearchError}</p>
                    )}
                    {isAddressDropdownOpen && (
                      <div
                        aria-busy={addressResults.isFetching}
                        className="assisted-search-results assisted-address-results"
                        data-testid="assisted-address-results"
                        id="assisted-address-listbox"
                        role="listbox"
                      >
                        <strong className="assisted-address-results-title">
                          Выберите вариант — карта переместится к нему
                        </strong>
                        {addressResults.isFetching && (
                          <p className="assisted-order-hint">Ищем на карте…</p>
                        )}
                        {addressResults.isError && (
                          <p className="form-error">
                            {addressResults.error.message}
                          </p>
                        )}
                        {addressResults.data?.items.map((result, index) => (
                          <button
                            aria-selected={index === activeAddressResultIndex}
                            className={
                              index === activeAddressResultIndex
                                ? "selected"
                                : ""
                            }
                            data-testid={`assisted-address-result-${result.provider}-${result.latitude}-${result.longitude}`}
                            id={`assisted-address-option-${index}`}
                            key={`${result.provider}:${result.latitude}:${result.longitude}`}
                            role="option"
                            type="button"
                            onClick={() => selectSearchResult(result)}
                            onMouseEnter={() =>
                              setActiveAddressResultIndex(index)
                            }
                          >
                            <strong>{result.label}</strong>
                            {result.aliases.length > 0 && (
                              <small>
                                Также: {result.aliases.slice(0, 3).join(" · ")}
                              </small>
                            )}
                            <b>Выбрать и показать на карте</b>
                          </button>
                        ))}
                        {addressResults.data &&
                          !addressResults.isFetching &&
                          !addressResults.data.items.length && (
                            <p className="assisted-address-empty">
                              Такого адреса нет в базе. Нажмите точное место на
                              карте ниже — заказ всё равно можно создать.
                            </p>
                          )}
                        {addressResults.data && (
                          <small className="map-attribution">
                            {addressResults.data.attribution}
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}
              {coordinates && !isAddressEditing && (
                <div
                  className="assisted-selected-address"
                  data-testid="assisted-selected-address"
                >
                  <div>
                    <span>Точка доставки выбрана</span>
                    <strong>
                      {selectedLocationLabel ||
                        selectedSavedAddress?.address ||
                        deliveryQuote.data?.addressLine ||
                        selectedAddressResult?.label ||
                        `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`}
                    </strong>
                    <small>
                      Маркер можно уточнить кликом по карте или перетаскиванием.
                    </small>
                  </div>
                  <button
                    className="secondary-button compact"
                    data-testid="assisted-address-change"
                    type="button"
                    onClick={startAddressSearch}
                  >
                    Найти другую точку
                  </button>
                </div>
              )}
              <div className="assisted-address-map-heading">
                <strong>Проверьте точку на карте</strong>
                <span>
                  Карта меняется после выбора найденного адреса или клика по
                  карте.
                </span>
              </div>
              <Suspense
                fallback={
                  <div className="assisted-map-loading">Загружаем карту…</div>
                }
              >
                <AssistedOrderMapPicker
                  coordinates={coordinates}
                  onChange={selectMapCoordinates}
                />
              </Suspense>
              <div
                className="assisted-delivery-summary"
                data-testid="assisted-delivery-pricing"
              >
                <input type="hidden" {...register("deliveryEtrapId")} />
                <strong>Доставка по выбранной точке</strong>
                {activeDeliveryQuote.data?.tariff === "NIGHT" && <span data-testid="assisted-delivery-night-tariff">Ночной тариф · время Ашхабада</span>}
                {!selectedAddressId && suggestedDeliveryEtrap && (
                  <span
                    className="assisted-delivery-match"
                    data-testid="assisted-delivery-etrap-auto"
                    role="status"
                  >
                    Район определён по адресу: {suggestedDeliveryEtrap.nameRu}
                    {" · "}доставка {deliveryQuote.data?.fee.toFixed(2)} TMT
                  </span>
                )}
                {!selectedAddressId && deliveryQuote.data && !suggestedDeliveryEtrap && (
                  <span
                    className="assisted-delivery-match"
                    data-testid="assisted-delivery-fallback"
                    role="status"
                  >
                    Точка принята · доставка по базовому тарифу{" "}
                    {deliveryQuote.data.fee.toFixed(2)} TMT
                  </span>
                )}
                {deliveryQuote.isFetching && !selectedAddressId && (
                  <span className="assisted-order-hint" role="status">
                    Определяем адрес и цену доставки…
                  </span>
                )}
                {activeDeliveryQuote.isError && (
                  <span className="form-error">
                    Не удалось показать предварительную цену. Стоимость доставки
                    будет рассчитана при создании заказа.
                  </span>
                )}
                {selectedAddressId && (
                  <span className="assisted-order-hint" role="status">
                    {selectedDeliveryEtrap
                      ? `${selectedDeliveryEtrap.nameRu} · доставка ${estimatedDeliveryFee?.toFixed(2)} TMT`
                      : estimatedDeliveryFee === null
                        ? "Сохранённый адрес · рассчитываем цену доставки"
                        : `Сохранённый адрес · базовая доставка ${estimatedDeliveryFee.toFixed(2)} TMT`}
                  </span>
                )}
                {!coordinates && !selectedAddressId && (
                  <span className="assisted-order-hint">
                    Найдите адрес или поставьте маркер — район и цена
                    подставятся автоматически.
                  </span>
                )}
              </div>
              <section
                className="assisted-courier-address-details"
                data-testid="assisted-courier-address-details"
              >
                <header>
                  <div>
                    <strong>Детали для курьера</strong>
                    <small>
                      Эти поля не двигают маркер: они помогают найти вход после
                      прибытия к выбранной точке.
                    </small>
                  </div>
                  <span>Не влияют на карту</span>
                </header>
                <div className="modal-grid assisted-address-details">
                  <div
                    className="wide-field assisted-map-details-note"
                    role="note"
                  >
                    Номер дома вводите в поиске выше. Подъезд, этаж и квартира
                    добавляются к заказу отдельно и не меняют координаты.
                  </div>
                  <label>
                    <span>Название адреса</span>
                    <input
                      data-testid="assisted-address-label"
                      {...register("addressLabel")}
                      placeholder="Дом / офис"
                    />
                  </label>
                  <label>
                    <span>Подъезд</span>
                    <input
                      data-testid="assisted-address-entrance"
                      {...register("entrance")}
                      placeholder="Например: 2"
                    />
                  </label>
                  <label>
                    <span>Этаж</span>
                    <input
                      data-testid="assisted-address-floor"
                      {...register("floor")}
                      placeholder="Например: 4"
                    />
                  </label>
                  <label>
                    <span>Квартира</span>
                    <input
                      data-testid="assisted-address-apartment"
                      {...register("apartment")}
                      placeholder="Например: 18"
                    />
                  </label>
                  <label className="wide-field">
                    <span>Ориентир для курьера (необязательно)</span>
                    <textarea
                      data-testid="assisted-order-address"
                      {...register("address")}
                      aria-invalid={Boolean(errors.address)}
                      maxLength={500}
                      placeholder="Например: синий подъезд со стороны двора"
                    />
                    <FormFieldError message={errors.address?.message} />
                  </label>
                </div>
              </section>
            </section>

            <section className="assisted-order-card assisted-order-extra">
              <div className="modal-grid">
                <label>
                  <span>Промокод</span>
                  <input
                    data-testid="assisted-order-promo"
                    {...register("promoCode")}
                    maxLength={40}
                  />
                  <FormFieldError message={errors.promoCode?.message} />
                </label>
                <label>
                  <span>Комментарий к заказу</span>
                  <textarea
                    data-testid="assisted-order-note"
                    {...register("customerNote")}
                    maxLength={500}
                    rows={3}
                    placeholder="Например: без лука, соус отдельно"
                    aria-describedby="assisted-order-note-hint"
                  />
                  <small id="assisted-order-note-hint">
                    До 500 символов. Отображается в заказе и печатается в чеке.
                  </small>
                  <FormFieldError message={errors.customerNote?.message} />
                </label>
              </div>
            </section>
          </div>
        </div>

        {(selectionError || actions.create.error) && (
          <div className="inline-alert" role="alert">
            {selectionError || mutationMessage(actions.create.error)}
          </div>
        )}
        <footer className="modal-actions assisted-order-actions">
          <div>
            <small>Итог и скидку проверяет backend</small>
            <strong>
              {estimatedDeliveryFee === null || estimatedTotal === null
                ? `${estimatedSubtotal.toFixed(2)} TMT + доставка`
                : `${estimatedTotal.toFixed(2)} TMT · доставка ${estimatedDeliveryFee.toFixed(2)} TMT`}
            </strong>
          </div>
          <button
            className="secondary-button"
            data-testid="assisted-order-cancel"
            type="button"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            className="primary-button"
            data-testid="assisted-order-submit"
            disabled={actions.create.isPending}
            type="submit"
          >
            {actions.create.isPending ? "Создаём…" : "Создать заказ"}
          </button>
        </footer>
      </form>
    </div>
  );
}
