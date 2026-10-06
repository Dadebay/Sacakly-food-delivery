"use client";
import { useEffect, useState } from "react";
import { customerApi, publicApi, type CafeRewards, type CafeWallet } from "@/shared/api";
import type { Locale } from "@/shared/i18n";
import { rewardsCopy } from "@/shared/rewards-copy";
export function CheckoutRewards({ cafeId, locale, signedIn, pending, code, selected, onCode, onGifts }: { cafeId: string; locale: Locale; signedIn: boolean; pending: boolean; code: string; selected: string[]; onCode: (value: string) => void; onGifts: (value: string[]) => void }) {
  const t = rewardsCopy[locale];
  const [data, setData] = useState<{ rewards: CafeRewards; wallet: CafeWallet | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([publicApi.rewards(cafeId), signedIn ? customerApi.wallet(cafeId) : Promise.resolve(null)]).then(([rewards, wallet]) => { if (active) setData({ rewards, wallet }); }).catch(() => { if (active) setError(t.loadError); });
    return () => { active = false; };
  }, [cafeId, signedIn, t.loadError]);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data || (!data.rewards.marketingEnabled && !data.rewards.loyaltyEnabled && !data.wallet?.pointsBalance && !data.wallet?.entries.length)) return null;
  const { rewards, wallet } = data;
  const spent = rewards.gifts.filter((gift) => selected.includes(gift.id)).reduce((sum, gift) => sum + gift.pointsCost, 0);
  return <section className="form-panel checkout-rewards" data-testid="checkout-rewards"><h2>{t.title}</h2><p className="input-note">{t.rules}</p>
    {rewards.marketingEnabled && <label>{t.code}<input data-testid="checkout-promo" disabled={pending} maxLength={40} value={code} onChange={(event) => onCode(event.target.value.toUpperCase())} autoComplete="off" /><small>{t.automatic}</small></label>}
    {(rewards.loyaltyEnabled || wallet) && <>{!rewards.loyaltyEnabled && <p className="input-note">{t.paused}</p>}<p data-testid="checkout-points-balance">{t.balance}: <strong>{wallet?.pointsBalance ?? "—"}</strong></p>{rewards.gifts.length > 0 && <fieldset disabled={pending || !signedIn}><legend>{t.gifts}</legend>{rewards.gifts.map((gift) => <label className="gift-choice" key={gift.id}><input data-testid={`checkout-gift-${gift.id}`} type="checkbox" checked={selected.includes(gift.id)} disabled={!selected.includes(gift.id) && (selected.length >= 10 || spent + gift.pointsCost > (wallet?.pointsBalance ?? 0))} onChange={(event) => onGifts(event.target.checked ? [...selected, gift.id] : selected.filter((id) => id !== gift.id))} /><span><strong>{gift.name} · {gift.pointsCost} {t.points}</strong><small>{gift.description}</small></span></label>)}</fieldset>}</>}
    {wallet && wallet.entries.length > 0 && <details data-testid="checkout-points-history"><summary>{t.history}</summary><ul className="points-history">{wallet.entries.map((entry) => <li key={entry.id}><span>{t[entry.kind]} · {new Intl.DateTimeFormat(locale === "tk" ? "en-GB" : locale, { timeZone: "Asia/Ashgabat" }).format(new Date(entry.createdAt))}</span><strong>{entry.points > 0 ? "+" : ""}{entry.points}</strong></li>)}</ul></details>}
  </section>;
}
