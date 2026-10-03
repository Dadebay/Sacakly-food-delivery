import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useAdminProducts, type Product } from "@/src/entities/catalog";
import { useDeliveryConfig, useDeliveryQuote } from "@/src/entities/delivery";
import {
  DeliveryLocationPicker,
  useGeocodeSearch,
  type DeliveryCoordinates,
} from "@/src/entities/geocoding";
import type { Courier, Order } from "@/src/entities/order";
import { FormFieldError } from "@/src/shared/forms";
import { useOrderActions } from "../api/use-order-actions";
import {
  orderAdminEditFormSchema,
  type OrderAdminEditFormInput,
  type OrderAdminEditFormValues,
} from "../model/order-admin-edit-form";

type EditableItem = {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
};

function personName(courier: Courier) {
  return (
    [courier.firstName, courier.lastName].filter(Boolean).join(" ") ||
    courier.phone
  );
}

function productOptions(products: Product[]) {
  return products.flatMap((product) => {
    const variants = product.variants.filter(({ isActive }) => isActive);
    if (product.pricingType === "FIXED") {
      return [
        {
          key: `${product.id}:base`,
          productId: product.id,
          name: product.name,
          price: product.price,
        },
      ];
    }
    if (!variants.length) return [];
    return variants.map((variant) => ({
      key: `${product.id}:${variant.id}`,
      productId: product.id,
      variantId: variant.id,
      name: `${product.name} · ${variant.name}`,
      price: variant.price,
    }));
  });
}

export function OrderAdminEditDialog({
  order,
  couriers,
  onClose,
}: {
  order: Order;
  couriers: Courier[];
  onClose: () => void;
}) {
  const actions = useOrderActions();
  const products = useAdminProducts();
  const deliveryConfig = useDeliveryConfig();
  const [items, setItems] = useState<EditableItem[]>(() =>
    order.items.map((item) => ({
      key: `${item.productId}:${item.productVariantId ?? "base"}`,
      productId: item.productId,
      ...(item.productVariantId ? { variantId: item.productVariantId } : {}),
      name: item.variantName
        ? `${item.productName} · ${item.variantName}`
        : item.productName,
      price: item.unitPrice,
      quantity: item.quantity,
    })),
  );
  const [coordinates, setCoordinates] = useState<DeliveryCoordinates>({
    latitude: order.latitude,
    longitude: order.longitude,
  });
  const [addressQuery, setAddressQuery] = useState(order.address);
  const [submittedAddressQuery, setSubmittedAddressQuery] = useState("");
  const [productToAdd, setProductToAdd] = useState("");
  const options = useMemo(
    () => productOptions(products.data ?? []),
    [products.data],
  );
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const quote = useDeliveryQuote(
    coordinates.latitude,
    coordinates.longitude,
    subtotal,
  );
  const addressResults = useGeocodeSearch(submittedAddressQuery);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<OrderAdminEditFormInput, unknown, OrderAdminEditFormValues>({
    resolver: zodResolver(orderAdminEditFormSchema),
    defaultValues: {
      deliveryEtrapId: String(order.deliveryEtrapId ?? ""),
      address: order.address,
      entrance: order.entrance ?? "",
      floor: order.floor ?? "",
      apartment: order.apartment ?? "",
      customerNote: order.customerNote ?? "",
      courierId: order.courierId ?? "",
    },
  });

  useEffect(() => {
    if (!quote.data) return;
    const officialAddress =
      quote.data.addressLine ??
      `Точка на карте: ${quote.data.latitude.toFixed(5)}, ${quote.data.longitude.toFixed(5)}`;
    setValue("address", officialAddress, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (quote.data.etrap) {
      setValue("deliveryEtrapId", String(quote.data.etrap.id), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [quote.data, setValue]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !actions.adminEdit.isPending) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [actions.adminEdit.isPending, onClose]);

  function changeQuantity(key: string, delta: number) {
    setItems((current) =>
      current
        .map((item) =>
          item.key === key
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter(({ quantity }) => quantity > 0),
    );
  }

  function addProduct() {
    const option = options.find(({ key }) => key === productToAdd);
    if (!option) return;
    setItems((current) => {
      const existing = current.find(({ key }) => key === option.key);
      if (existing) {
        return current.map((item) =>
          item.key === option.key
            ? { ...item, quantity: Math.min(50, item.quantity + 1) }
            : item,
        );
      }
      return [...current, { ...option, quantity: 1 }];
    });
    setProductToAdd("");
  }

  async function submit(values: OrderAdminEditFormValues) {
    if (!items.length) return;
    await actions.adminEdit.mutateAsync({
      orderId: order.id,
      body: {
        version: order.version,
        items: items.map(({ productId, variantId, quantity }) => ({
          productId,
          ...(variantId ? { variantId } : {}),
          quantity,
        })),
        deliveryEtrapId: values.deliveryEtrapId,
        address: values.address,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        entrance: values.entrance,
        floor: values.floor,
        apartment: values.apartment,
        customerNote: values.customerNote,
        ...(values.courierId ? { courierId: values.courierId } : {}),
      },
    });
    onClose();
  }

  return (
    <div className="modal-backdrop" data-testid="order-admin-edit-dialog">
      <section
        aria-labelledby="order-admin-edit-title"
        aria-modal="true"
        className="modal assisted-order-modal order-admin-edit-modal"
        role="dialog"
      >
        <header className="modal-head">
          <div>
            <span className="eyebrow">ПОЛНОЕ РЕДАКТИРОВАНИЕ</span>
            <h2 id="order-admin-edit-title">Заказ #{order.number}</h2>
            <p>
              Суммы, скидка, доставка и ближайший филиал пересчитаются backend.
            </p>
          </div>
          <button aria-label="Закрыть" type="button" onClick={onClose}>
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit((values) => void submit(values))}>
          <div className="assisted-order-layout">
            <section className="assisted-order-card">
              <h3>Состав заказа</h3>
              <div className="assisted-cart-list">
                {items.map((item) => (
                  <div className="assisted-cart-row" key={item.key}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.price.toFixed(2)} TMT</small>
                    </div>
                    <div className="quantity-stepper">
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.key, -1)}
                      >
                        −
                      </button>
                      <strong>{item.quantity}</strong>
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.key, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!items.length && (
                <p className="form-error">Добавьте хотя бы одну позицию.</p>
              )}
              <div className="assisted-customer-search">
                <select
                  value={productToAdd}
                  onChange={(event) => setProductToAdd(event.target.value)}
                >
                  <option value="">Добавить блюдо…</option>
                  {options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.name} · {option.price.toFixed(2)} TMT
                    </option>
                  ))}
                </select>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!productToAdd}
                  onClick={addProduct}
                >
                  Добавить
                </button>
              </div>
              <strong>Новый подытог: {subtotal.toFixed(2)} TMT</strong>
              {order.status === "ASSIGNED_TO_COURIER" && (
                <p className="form-hint">
                  Если состав изменится, заказ вернётся «На кухне»:
                  приготовление, упаковку и курьера нужно подтвердить заново.
                </p>
              )}
              {order.status === "ASSIGNED_TO_COURIER" && (
                <label>
                  <span>Курьер</span>
                  <select {...register("courierId")}>
                    <option value="">Текущий курьер</option>
                    {couriers.map((courier) => (
                      <option key={courier.id} value={courier.id}>
                        {personName(courier)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>

            <section className="assisted-order-card">
              <h3>Адрес и доставка</h3>
              <div className="assisted-customer-search">
                <input
                  value={addressQuery}
                  onChange={(event) => setAddressQuery(event.target.value)}
                  placeholder="Официальный адрес"
                />
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSubmittedAddressQuery(addressQuery.trim())}
                >
                  Найти
                </button>
              </div>
              {addressResults.data?.items.map((result) => (
                <button
                  className="secondary-button compact"
                  key={`${result.latitude}:${result.longitude}`}
                  type="button"
                  onClick={() => {
                    setCoordinates({
                      latitude: result.latitude,
                      longitude: result.longitude,
                    });
                    setAddressQuery(result.label);
                    setValue("address", result.label, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                >
                  {result.label}
                </button>
              ))}
              <DeliveryLocationPicker
                coordinates={coordinates}
                onChange={setCoordinates}
              />
              {quote.isFetching && (
                <p className="form-hint">
                  Обновляем официальный адрес и цену доставки…
                </p>
              )}
              {quote.data?.addressLine && (
                <p className="form-hint">
                  Официальный адрес точки:{" "}
                  <strong>{quote.data.addressLine}</strong>
                </p>
              )}
              <label>
                <span>Адрес в заказе</span>
                <textarea
                  {...register("address")}
                  aria-invalid={Boolean(errors.address)}
                />
                <FormFieldError message={errors.address?.message} />
              </label>
              <label>
                <span>Тарифный район</span>
                <select
                  {...register("deliveryEtrapId")}
                  aria-invalid={Boolean(errors.deliveryEtrapId)}
                >
                  <option value="">Выберите район</option>
                  {deliveryConfig.data?.welayats.map((welayat) => (
                    <optgroup key={welayat.id} label={welayat.nameRu}>
                      {welayat.etraps.map((etrap) => (
                        <option key={etrap.id} value={etrap.id}>
                          {etrap.nameRu} · {etrap.price.toFixed(2)} TMT
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <FormFieldError message={errors.deliveryEtrapId?.message} />
              </label>
              <div className="modal-grid assisted-address-details">
                <label>
                  <span>Подъезд</span>
                  <input {...register("entrance")} />
                </label>
                <label>
                  <span>Этаж</span>
                  <input {...register("floor")} />
                </label>
                <label>
                  <span>Квартира</span>
                  <input {...register("apartment")} />
                </label>
              </div>
              <label>
                <span>Комментарий к заказу</span>
                <textarea
                  data-testid="order-admin-edit-note"
                  {...register("customerNote")}
                  maxLength={500}
                  rows={3}
                  placeholder="Например: без лука, соус отдельно"
                  aria-describedby="order-admin-edit-note-hint"
                />
                <small id="order-admin-edit-note-hint">
                  До 500 символов. После сохранения распечатайте обновлённый чек.
                </small>
                <FormFieldError message={errors.customerNote?.message} />
              </label>
            </section>
          </div>
          {actions.adminEdit.error && (
            <div className="inline-alert" role="alert">
              {actions.adminEdit.error.message}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              className="primary-button"
              data-testid="order-admin-edit-submit"
              disabled={!items.length || actions.adminEdit.isPending}
              type="submit"
            >
              {actions.adminEdit.isPending
                ? "Сохраняем…"
                : "Сохранить все изменения"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
