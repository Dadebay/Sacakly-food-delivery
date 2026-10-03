import type { Order } from "../model/types";
import { orderPaymentBreakdown } from "../model/types";

function money(value: number) {
  return `${value.toFixed(2)} TMT`;
}

export function OrderPaymentBreakdown({
  order,
  className,
  testId,
}: {
  order: Pick<Order, "subtotal" | "discount" | "deliveryFee" | "total">;
  className?: string;
  testId: string;
}) {
  const payment = orderPaymentBreakdown(order);

  return (
    <dl
      className={["order-payment-breakdown", className]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
      aria-label="Разбивка оплаты"
    >
      <div>
        <dt>Еда</dt>
        <dd>{money(payment.food)}</dd>
      </div>
      <div>
        <dt>Доставка</dt>
        <dd>{money(payment.delivery)}</dd>
      </div>
      <div className="order-payment-total">
        <dt>Итого</dt>
        <dd>{money(payment.total)}</dd>
      </div>
    </dl>
  );
}
