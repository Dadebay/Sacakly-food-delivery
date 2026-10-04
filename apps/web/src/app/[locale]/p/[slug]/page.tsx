import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { publicApi } from "@/shared/api";
import { isLocale, locales } from "@/shared/i18n";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale, slug } = await params; if (!isLocale(locale)) return {}; const page = await publicApi.page(locale, slug).catch(() => null); return page ? { title: page.title, description: page.description, alternates: { canonical: `/${locale}/p/${slug}`, languages: Object.fromEntries(locales.map((entry) => [entry, `/${entry}/p/${slug}`])) } } : { robots: { index: false } }; }
export default async function ContentPage({ params }: Props) { const { locale, slug } = await params; if (!isLocale(locale)) notFound(); const page = await publicApi.page(locale, slug).catch(() => null); if (!page) notFound(); return <main className="container prose-page"><p className="eyebrow">SAÇAKLY / {page.locale.toUpperCase()}</p><h1>{page.title}</h1><p className="lead">{page.description}</p><div className="page-body">{page.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></main>; }
