import { z } from "zod";

export const inspectionSearchSchema = z.object({
  number: z
    .string()
    .trim()
    .refine(
      (value) =>
        !value ||
        (/^\d+$/.test(value) &&
          Number(value) > 0 &&
          Number(value) <= 2147483647),
      "Введите номер заказа",
    ),
});

export const inspectionMoney = (value: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "TMT" }).format(
    value,
  );
export const inspectionTime = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Ashgabat",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export const auditActionLabels: Record<string, string> = {
  "app_version.saved": "Версия мобильного приложения настроена",
  "branch.created": "Филиал создан",
  "staff.created": "Сотрудник добавлен",
  "catalog.cafe.created": "Кафе добавлено",
  "catalog.cafe.deleted": "Кафе удалено",
  "catalog.category.created": "Категория добавлена",
  "catalog.category.deleted": "Категория удалена",
  "catalog.product-image.created": "Изображение блюда добавлено",
  "catalog.receipt-printer.created": "Принтер добавлен",
  "catalog.receipt-printer.deleted": "Принтер удалён",
  "delivery.etrap_created": "Район доставки добавлен",
  "delivery.etrap_updated": "Район доставки изменён",
  "delivery.settings_updated": "Тарифы доставки изменены",
  "delivery.welayat_created": "Регион добавлен",
  "delivery.welayat_updated": "Регион изменён",
  "inventory.ingredient.created": "Ингредиент добавлен",
  "inventory.ingredient.updated": "Ингредиент изменён",
  "inventory.order.adjusted": "Расход продуктов по заказу изменён",
  "inventory.recipe.upserted": "Рецептура сохранена",
  "inventory.stock.adjusted": "Движение склада",
  "loyalty.gift.created": "Подарок добавлен",
  "loyalty.gift.updated": "Подарок изменён",
  "marketing.banner.created": "Баннер добавлен",
  "marketing.banner.deleted": "Баннер удалён",
  "marketing.promo.created": "Промокод добавлен",
  "notification.campaign.created": "Рассылка создана",
  "notification.campaign.finished": "Рассылка завершена",
  "notification.campaign.retry_requested": "Повтор рассылки запрошен",
  "ordering-hours.updated": "Часы приёма заказов изменены",
  "customer.profile_completed_by_staff": "Данные клиента заполнены сотрудником",
  "customer.resolved_for_phone_order": "Клиент выбран для телефонного заказа",
  "order.rated": "Клиент оценил заказ",
  "receipt.kitchen_scheduled": "Кухонный чек запланирован",
  "receipt.adjusted_after_order_edit":
    "Чек исправлен после редактирования заказа",
  "receipt.cancelled_after_order_edit":
    "Чек отменён после редактирования заказа",
  "receipt.requeued_after_order_edit":
    "Новый чек поставлен в очередь после редактирования",
  "receipt.delivery_result": "Результат отправки чека",
  "receipt.manually_cancelled": "Печать чека отменена вручную",
  "receipt.reprint_requested": "Запрошена повторная печать",
  "receipt.retry_requested": "Повтор отправки чека запрошен",
  "admin_role_page_access.updated": "Права доступа роли изменены",
  "order.created": "Заказ создан в приложении",
  "order.created_by_staff": "Заказ оформлен по телефону",
  "order.historical-completion-requested":
    "Историческое завершение по поручению владельца",
  "order.historical-cash-reconciled": "Отмечена ранее сданная оплата",
  "order.admin-edited": "Заказ отредактирован",
  "order.admin-completed": "Заказ завершён администратором",
  "order.cancelled": "Заказ отменён",
  "order.transitioned": "Статус заказа изменён",
  "order.packing-confirmed": "Сборка подтверждена",
  "order.courier-assigned": "Курьер назначен",
  "order.courier-reassigned": "Курьер заменён",
  "order.request.rejected": "Действие с заказом отклонено",
  "cash_handoff.submitted": "Деньги смены переданы",
  "cash_handoff.confirmed": "Деньги смены подтверждены",
  "catalog.product.updated": "Блюдо изменено",
  "catalog.product.created": "Блюдо добавлено",
  "catalog.product.deleted": "Блюдо удалено",
  "catalog.category.updated": "Категория изменена",
  "catalog.cafe.updated": "Кафе изменено",
  "catalog.receipt-printer.updated": "Принтер изменён",
  "catalog.receipt-print-settings.updated": "Настройки печати изменены",
  "marketing.promo.updated": "Промокод изменён",
  "marketing.banner.updated": "Баннер изменён",
  "branch.updated": "Филиал изменён",
  "staff.updated": "Сотрудник изменён",
  "accounting.settings_updated": "Границы смен изменены",
  "contacts.updated": "Контакты изменены",
};

export const auditFieldLabels: Record<string, string> = {
  actualCashDateUnknown: "Точная дата сдачи неизвестна",
  historicalCashAlreadySurrendered: "Деньги сданы ранее",
  actualCourierUnknown: "Фактический курьер неизвестен",
  cashSettlement: "Расчёт по заказу",
  branchAddress: "Адрес кухни",
  assignedAt: "Назначение курьера",
  deliveredAt: "Доставлено",
  completedAt: "Деньги возвращены",
  packingConfirmedAt: "Сборка подтверждена",
  gifts: "Подарки",
  loyaltyPointsEarned: "Баллы за заказ",
  loyaltyPointsSpent: "Баллы за подарки",
  rating: "Оценка клиента",
  score: "Оценка",
  comment: "Комментарий",
  operatorTakenAt: "Деньги приняты",
  reconciledAt: "Сверено бухгалтером",
  cashHandoffId: "Пакет смены",
  operatorId: "Принял деньги",
  accountantId: "Бухгалтер",
  before: "До изменения",
  after: "После изменения",
  previous: "До изменения",
  current: "После изменения",
  number: "Номер",
  version: "Версия",
  status: "Статус",
  fromStatus: "Предыдущий статус",
  toStatus: "Новый статус",
  source: "Источник",
  customerId: "Клиент",
  address: "Адрес",
  latitude: "Широта",
  longitude: "Долгота",
  entrance: "Подъезд",
  floor: "Этаж",
  apartment: "Квартира",
  customerNote: "Комментарий к заказу",
  branchId: "Филиал (ID)",
  branchName: "Филиал",
  deliveryEtrapId: "Район (ID)",
  deliveryEtrapName: "Район",
  courierId: "Курьер",
  previousCourierId: "Предыдущий курьер",
  cookId: "Повар",
  subtotal: "Еда до скидки",
  discount: "Скидка",
  deliveryFee: "Доставка",
  total: "Итого",
  amount: "Сумма",
  cancellationReason: "Причина отмены",
  reason: "Причина",
  items: "Состав заказа",
  productId: "Блюдо (ID)",
  productName: "Блюдо",
  productVariantId: "Вариант (ID)",
  variantName: "Вариант",
  quantity: "Количество",
  unitPrice: "Цена за единицу",
  lineTotal: "Сумма позиции",
  preparationMinutes: "Приготовление, минут",
  expectedAmount: "По системе",
  declaredAmount: "Фактически передано",
  settlementCount: "Заказов с деньгами",
  shiftKey: "Смена",
  name: "Название",
  price: "Цена",
  isActive: "Активен",
  changedFields: "Изменённые поля",
  method: "Метод",
  route: "Действие API",
  actorRole: "Роль при действии",
};

export function auditChanges(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return [];
  const value = metadata as Record<string, unknown>;
  const before = value.before ?? value.previous;
  const after = value.after ?? value.current;
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) ||
    Array.isArray(after)
  )
    return [];
  const previous = before as Record<string, unknown>;
  const current = after as Record<string, unknown>;
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter(
      (key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]),
    )
    .map((key) => ({ key, before: previous[key], after: current[key] }));
}

export const personName = (
  person:
    | { firstName?: string | null; lastName?: string | null }
    | null
    | undefined,
) =>
  person
    ? [person.firstName, person.lastName].filter(Boolean).join(" ") ||
      "Имя не заполнено"
    : "Не указан";
export const evidenceRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const entityLabels: Record<string, string> = {
  Order: "Заказ",
  ReceiptPrintTask: "Печать чека",
  CashHandoff: "Сдача денег за смену",
  AccountingSettings: "Расписание смен",
  User: "Сотрудник",
  Product: "Блюдо",
  Category: "Категория",
  Cafe: "Кафе",
  Branch: "Кухня",
  PromoCode: "Промокод",
  Banner: "Баннер",
  OperationsRequest: "Запрос сотрудника",
};
export function actionLabel(action: string) {
  return auditActionLabels[action] ?? "Изменение записи";
}
export function auditSummary(metadata: unknown) {
  const value = evidenceRecord(metadata),
    after = evidenceRecord(value.after ?? value.current);
  const reason =
    value.reason ??
    after.cancellationReason ??
    value.cancellationReason ??
    value.note;
  const fields = auditChanges(metadata).filter(
    (change) => !["version", "updatedAt", "id"].includes(change.key),
  );
  const parts = fields.map(
    (change) => auditFieldLabels[change.key] ?? "Данные записи",
  );
  return typeof reason === "string" && reason
    ? reason
    : parts.length
      ? `Изменено: ${parts.join(", ")}`
      : "Подробности сохранены в истории действия";
}
