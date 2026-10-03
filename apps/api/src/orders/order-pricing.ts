import { PromoType } from "../generated/prisma/client";

function toCents(value: number) {
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return value / 100;
}

export function roundMoney(value: number) {
  return fromCents(toCents(value));
}

export function calculatePromoDiscount(
  promo: {
    type: PromoType;
    value: number;
    maxDiscountAmount: number | null;
  },
  subtotal: number,
) {
  const rawDiscount =
    promo.type === PromoType.PERCENT
      ? subtotal * (promo.value / 100)
      : promo.value;
  const cappedDiscount =
    promo.maxDiscountAmount === null
      ? rawDiscount
      : Math.min(rawDiscount, promo.maxDiscountAmount);

  return fromCents(
    Math.min(toCents(subtotal), Math.max(0, toCents(cappedDiscount))),
  );
}

/**
 * Allocates an order-level discount proportionally across display lines while
 * keeping every line non-negative and the rounded line discounts equal to the
 * authoritative order discount.
 */
export function allocateDiscountAcrossLines(
  lineTotals: number[],
  discount: number,
) {
  const lineCents = lineTotals.map(toCents);
  let remainingSubtotal = lineCents.reduce((sum, value) => sum + value, 0);
  let remainingDiscount = Math.min(
    remainingSubtotal,
    Math.max(0, toCents(discount)),
  );

  return lineCents.map((lineSubtotal, index) => {
    const isLastLine = index === lineCents.length - 1;
    const allocated =
      remainingSubtotal === 0
        ? 0
        : isLastLine
          ? remainingDiscount
          : Math.min(
              lineSubtotal,
              Math.round(
                (remainingDiscount * lineSubtotal) / remainingSubtotal,
              ),
            );

    remainingSubtotal -= lineSubtotal;
    remainingDiscount -= allocated;
    return fromCents(allocated);
  });
}
