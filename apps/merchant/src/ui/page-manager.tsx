import { useEffect, useState, type FormEvent } from "react";
import { api, type SitePage } from "../api/client";
type Locale = "tk" | "ru" | "en";
const empty = { title: "", description: "", body: "", published: false };
export function PageManager() {
  const [pages, setPages] = useState<SitePage[]>([]);
  const [locale, setLocale] = useState<Locale>("tk");
  const [slug, setSlug] = useState("home");
  const [form, setForm] = useState(empty);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const active = pages.find((page) => page.locale === locale && page.slug === slug);
  useEffect(() => { api.sitePages().then(setPages).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить страницы")); }, []);
  useEffect(() => { setForm(active ? { title: active.title, description: active.description, body: active.body, published: active.published } : empty); }, [active]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setMessage("");
    try {
      const updated = await api.saveSitePage(locale, slug, { ...form, expectedVersion: active?.version ?? 0 });
      setPages((before) => [...before.filter((page) => !(page.locale === locale && page.slug === slug)), updated].sort((a, b) => `${a.locale}/${a.slug}`.localeCompare(`${b.locale}/${b.slug}`)));
      setMessage(updated.published ? "Страница опубликована" : "Черновик сохранён");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить страницу"); }
    finally { setPending(false); }
  }
  return <div className="panel page-manager" data-testid="owner-page-manager"><div className="panel-heading"><h3>CRM · страницы и SEO</h3><span>{pages.length} версий</span></div><p>Настройте текст главной страницы (адрес <code>home</code>) и отдельные страницы для каждого языка. HTML не принимается.</p>{error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}<div className="page-list">{pages.map((page) => <button type="button" key={`${page.locale}/${page.slug}`} onClick={() => { setLocale(page.locale as Locale); setSlug(page.slug); }} className={page.locale === locale && page.slug === slug ? "selected" : ""}>{page.locale.toUpperCase()} / {page.slug} · {page.published ? "опубликована" : "черновик"}</button>)}</div><form onSubmit={save} className="page-form"><div className="page-fields"><label>Язык<select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="tk">Türkmençe</option><option value="ru">Русский</option><option value="en">English</option></select></label><label>Адрес страницы<input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} required /></label></div><label>Заголовок страницы<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} minLength={2} maxLength={160} required /></label><label>SEO описание<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} minLength={10} maxLength={300} required /></label><label>Текст страницы<textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} maxLength={20000} rows={7} /></label><label className="page-checkbox"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} /> Опубликовать</label><button className="primary-button" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить страницу"}</button></form></div>;
}
