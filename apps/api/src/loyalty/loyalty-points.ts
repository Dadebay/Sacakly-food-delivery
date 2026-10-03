function totalPoints(
  lines: readonly { points: number; quantity: number }[],
) {
  return lines.reduce((total, line) => {
    if (
      !Number.isSafeInteger(line.points) ||
      line.points < 1 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1
    ) {
      throw new RangeError("Points and quantity must be positive integers");
    }
    const next = total + line.points * line.quantity;
    if (!Number.isSafeInteger(next) || next > 2_147_483_647) {
      throw new RangeError("Point total exceeds supported range");
    }
    return next;
  }, 0);
}

export function earnedPoints(lines: readonly { points: number; quantity: number }[]) {
  return totalPoints(lines);
}

export function redemptionPoints(lines: readonly { pointsCost: number; quantity: number }[]) {
  return totalPoints(lines.map(({ pointsCost, quantity }) => ({ points: pointsCost, quantity })));
}
