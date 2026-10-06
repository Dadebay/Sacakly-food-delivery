import type { CafeRewards } from "@/shared/api";
import type { Locale } from "@/shared/i18n";
import { rewardsCopy } from "@/shared/rewards-copy";
export function CafeOffers({ rewards, locale }: { rewards: CafeRewards; locale: Locale }) {
  const t = rewardsCopy[locale];
  if (!rewards.promotions.length) return null;
  return <section className="cafe-offers" aria-label={t.title} data-testid="cafe-offers"><h2>{t.title}</h2><p>{t.automatic}</p><ul>{rewards.promotions.map((offer) => <li key={offer.id}><strong>{offer.title} · −{offer.value}{offer.type === "PERCENT" ? "%" : " TMT"}</strong><small>{t.minimum}: {offer.minOrderAmount} TMT{offer.maxDiscountAmount !== null && ` · ${t.cap}: ${offer.maxDiscountAmount} TMT`} · {t.limit}: {offer.perUserLimit}{offer.endsAt && ` · ${t.ends}: ${new Intl.DateTimeFormat(locale === "tk" ? "en-GB" : locale, { timeZone: "Asia/Ashgabat", dateStyle: "short", timeStyle: "short" }).format(new Date(offer.endsAt))}`}</small></li>)}</ul></section>;
}
