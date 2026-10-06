import { useEffect, useState, type FormEvent } from "react";
import { api, type CafeRewards, type CafePromotion, type CafeGift, type PromotionInput, type GiftInput } from "../api/client";

const blankPromo = { title: "", code: "", isAutomatic: true, type: "PERCENT" as "PERCENT" | "FIXED", value: "10", minOrderAmount: "0", maxDiscountAmount: "", totalUsageLimit: "", perUserLimit: "1", startsAt: "", endsAt: "", isActive: true };
const blankGift = { name: "", description: "", pointsCost: "10", stock: "", isActive: true };
function localDate(value: string | null) { return value ? new Date(new Date(value).getTime() + 5 * 3600_000).toISOString().slice(0, 16) : ""; }

export function RewardsManager({ cafeId }: { cafeId: string }) {
  const [data, setData] = useState<CafeRewards | null>(null);
  const [revision, setRevision] = useState(0);
  const [promo, setPromo] = useState(blankPromo);
  const [gift, setGift] = useState(blankGift);
  const [editingPromo, setEditingPromo] = useState<CafePromotion | undefined>();
  const [editingGift, setEditingGift] = useState<CafeGift | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    api.cafeRewards(cafeId).then((value) => { if (active) setData(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить акции"); });
    return () => { active = false; };
  }, [cafeId, revision]);
  function editPromo(item: CafePromotion) {
    setEditingPromo(item);
    setPromo({ title: item.title, code: item.code ?? "", isAutomatic: item.isAutomatic, type: item.type, value: String(item.value), minOrderAmount: String(item.minOrderAmount), maxDiscountAmount: item.maxDiscountAmount === null ? "" : String(item.maxDiscountAmount), totalUsageLimit: item.totalUsageLimit === null ? "" : String(item.totalUsageLimit), perUserLimit: String(item.perUserLimit), startsAt: localDate(item.startsAt), endsAt: localDate(item.endsAt), isActive: item.isActive });
  }
  function editGift(item: CafeGift) { setEditingGift(item); setGift({ name: item.name, description: item.description, pointsCost: String(item.pointsCost), stock: item.stock === null ? "" : String(item.stock), isActive: item.isActive }); }
  async function save(kind: "promotion" | "gift", event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (kind === "promotion") {
        const input: PromotionInput = { title: promo.title.trim(), code: promo.isAutomatic ? null : promo.code.trim(), isAutomatic: promo.isAutomatic, type: promo.type, value: Number(promo.value), minOrderAmount: Number(promo.minOrderAmount), maxDiscountAmount: promo.maxDiscountAmount === "" ? null : Number(promo.maxDiscountAmount), totalUsageLimit: promo.totalUsageLimit === "" ? null : Number(promo.totalUsageLimit), perUserLimit: Number(promo.perUserLimit), startsAt: promo.startsAt ? `${promo.startsAt}:00+05:00` : null, endsAt: promo.endsAt ? `${promo.endsAt}:00+05:00` : null, isActive: promo.isActive };
        await api.saveCafePromotion(cafeId, input, editingPromo); setPromo(blankPromo); setEditingPromo(undefined);
      } else {
        const input: GiftInput = { name: gift.name.trim(), description: gift.description.trim(), pointsCost: Number(gift.pointsCost), stock: gift.stock === "" ? null : Number(gift.stock), isActive: gift.isActive };
        await api.saveCafeGift(cafeId, input, editingGift); setGift(blankGift); setEditingGift(undefined);
      }
      setRevision((value) => value + 1); setMessage("Настройки сохранены");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить. Обновите список и повторите."); }
    finally { setBusy(false); }
  }
  return <div data-testid="merchant-rewards-root" className="rewards-manager">
    <div className="catalog-heading"><div><h3>Акции и баллы кафе</h3><p>Каждое кафе ведёт свою программу. Баллы за блюда задаются в меню и начисляются после доставки.</p></div><button data-testid="rewards-refresh" className="outline-button" disabled={busy} onClick={() => { setError(""); setRevision((v) => v + 1); }}>Обновить</button></div>
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}
    {!data ? <p>Загружаем настройки…</p> : <div className="rewards-grid">
      <section className="panel" data-testid="rewards-promotions"><h3>Скидки и акции</h3><p>Без промокода применяется одна лучшая доступная автоматическая акция. Введённый промокод заменяет её. Доставка не участвует в скидке.</p>
        {!data.marketingEnabled && <p className="notice">OWNER должен включить модуль «Скидки и акции».</p>}
        <form data-testid="promotion-form" className="catalog-form" onSubmit={(event) => save("promotion", event)}><fieldset disabled={busy || !data.marketingEnabled} className="rewards-fields">
          <label>Название<input data-testid="promotion-title" required minLength={2} maxLength={160} value={promo.title} onChange={(e) => setPromo({ ...promo, title: e.target.value })} /></label>
          <label className="check-label"><input data-testid="promotion-automatic" type="checkbox" checked={promo.isAutomatic} onChange={(e) => setPromo({ ...promo, isAutomatic: e.target.checked })} /> Автоматическая акция</label>
          {!promo.isAutomatic && <label>Промокод<input data-testid="promotion-code" required pattern="(?:[A-Za-z0-9_]|-){2,40}" maxLength={40} value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value.toUpperCase() })} /></label>}
          <div className="catalog-two"><label>Тип скидки<select data-testid="promotion-type" value={promo.type} onChange={(e) => setPromo({ ...promo, type: e.target.value as typeof promo.type })}><option value="PERCENT">Процент</option><option value="FIXED">Сумма в TMT</option></select></label><label>Размер<input data-testid="promotion-value" type="number" required min="0.01" step="0.01" max={promo.type === "PERCENT" ? 100 : 999999.99} value={promo.value} onChange={(e) => setPromo({ ...promo, value: e.target.value })} /></label></div>
          <div className="catalog-two"><label>Заказ от, TMT<input data-testid="promotion-minimum" type="number" required min="0" max="999999.99" step="0.01" value={promo.minOrderAmount} onChange={(e) => setPromo({ ...promo, minOrderAmount: e.target.value })} /></label><label>Макс. скидка, TMT<input data-testid="promotion-cap" type="number" min="0.01" max="999999.99" step="0.01" placeholder="Без ограничения" value={promo.maxDiscountAmount} onChange={(e) => setPromo({ ...promo, maxDiscountAmount: e.target.value })} /></label></div>
          <div className="catalog-two"><label>Общий лимит применений<input data-testid="promotion-limit" type="number" min="1" max="1000000" placeholder="Без ограничения" value={promo.totalUsageLimit} onChange={(e) => setPromo({ ...promo, totalUsageLimit: e.target.value })} /></label><label>На одного покупателя<input data-testid="promotion-user-limit" type="number" required min="1" max="1000000" value={promo.perUserLimit} onChange={(e) => setPromo({ ...promo, perUserLimit: e.target.value })} /></label></div>
          <label>Начало · время Ашхабада<input data-testid="promotion-start" type="datetime-local" value={promo.startsAt} onChange={(e) => setPromo({ ...promo, startsAt: e.target.value })} /></label><label>Окончание · время Ашхабада<input data-testid="promotion-end" type="datetime-local" value={promo.endsAt} onChange={(e) => setPromo({ ...promo, endsAt: e.target.value })} /></label>
          <label className="check-label"><input data-testid="promotion-active" type="checkbox" checked={promo.isActive} onChange={(e) => setPromo({ ...promo, isActive: e.target.checked })} /> Активна</label><button data-testid="promotion-save" className="mini-primary">{editingPromo ? "Сохранить акцию" : "Создать акцию"}</button>
        </fieldset></form>{editingPromo && <button data-testid="promotion-cancel" disabled={busy} onClick={() => { setPromo(blankPromo); setEditingPromo(undefined); }}>Отмена редактирования</button>}
        <div className="catalog-list">{data.promotions.map((item) => <article className="catalog-row" key={item.id} data-testid={`promotion-${item.id}`}><div><strong>{item.title}</strong><small>{item.code || "Автоматически"} · {item.value}{item.type === "PERCENT" ? "%" : " TMT"} · {item.isActive ? "активна" : "выключена"} · применений: {item.usedCount}</small></div><button data-testid={`promotion-edit-${item.id}`} disabled={busy} onClick={() => editPromo(item)}>Изменить</button></article>)}</div>
      </section>
      <section className="panel" data-testid="rewards-gifts"><h3>Подарки за баллы</h3><p>Баллы действуют только в этом кафе. Подарок добавляется к обычному заказу. Отмена возвращает списанные баллы и остаток подарка.</p>
        {!data.loyaltyEnabled && <p className="notice">OWNER должен включить модуль «Баллы и подарки».</p>}
        <form data-testid="gift-form" className="catalog-form" onSubmit={(event) => save("gift", event)}><fieldset disabled={busy || !data.loyaltyEnabled} className="rewards-fields">
          <label>Название<input data-testid="gift-name" required minLength={2} maxLength={160} value={gift.name} onChange={(e) => setGift({ ...gift, name: e.target.value })} /></label><label>Описание<textarea data-testid="gift-description" maxLength={2000} value={gift.description} onChange={(e) => setGift({ ...gift, description: e.target.value })} /></label>
          <div className="catalog-two"><label>Стоимость в баллах<input data-testid="gift-points" required type="number" min="1" max="1000000" value={gift.pointsCost} onChange={(e) => setGift({ ...gift, pointsCost: e.target.value })} /></label><label>Остаток<input data-testid="gift-stock" type="number" min="0" max="1000000" placeholder="Без ограничения" value={gift.stock} onChange={(e) => setGift({ ...gift, stock: e.target.value })} /></label></div>
          <label className="check-label"><input data-testid="gift-active" type="checkbox" checked={gift.isActive} onChange={(e) => setGift({ ...gift, isActive: e.target.checked })} /> Активен</label><button data-testid="gift-save" className="mini-primary">{editingGift ? "Сохранить подарок" : "Создать подарок"}</button>
        </fieldset></form>{editingGift && <button data-testid="gift-cancel" disabled={busy} onClick={() => { setGift(blankGift); setEditingGift(undefined); }}>Отмена редактирования</button>}
        <div className="catalog-list">{data.gifts.map((item) => <article key={item.id} className="catalog-row" data-testid={`gift-${item.id}`}><div><strong>{item.name}</strong><small>{item.pointsCost} баллов · остаток: {item.stock ?? "без ограничения"} · {item.isActive ? "активен" : "выключен"}</small></div><button data-testid={`gift-edit-${item.id}`} disabled={busy} onClick={() => editGift(item)}>Изменить</button></article>)}</div>
      </section>
    </div>}
  </div>;
}
