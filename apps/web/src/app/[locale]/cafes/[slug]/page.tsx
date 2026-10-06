import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { publicApi } from "@/shared/api";
import { copy, isLocale, locales } from "@/shared/i18n";
import { CafeOffers } from "@/features/cafe-offers";
import { MenuCart } from "@/features/menu-cart";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale, slug } = await params; const cafe = (await publicApi.cafes().catch(() => [])).find((entry) => entry.slug === slug); if (!cafe || !isLocale(locale)) return { robots: { index: false } }; return { title: cafe.name, description: cafe.description || copy[locale].heroText, alternates: { canonical: `/${locale}/cafes/${slug}`, languages: Object.fromEntries(locales.map((entry) => [entry, `/${entry}/cafes/${slug}`])) }, openGraph: { title: cafe.name, description: cafe.description || copy[locale].heroText } }; }
export default async function CafePage({ params }: Props) { const { locale, slug } = await params; if (!isLocale(locale)) notFound(); const cafe = (await publicApi.cafes().catch(() => [])).find((entry) => entry.slug === slug); if (!cafe) notFound(); const [categories, rewards] = await Promise.all([publicApi.categories(cafe.id).catch(() => []), publicApi.rewards(cafe.id).catch(() => null)]); const t = copy[locale]; return <main className="container cafe-page"><div className="breadcrumbs"><Link href={`/${locale}`}>{t.cafes}</Link><span>/</span><span>{cafe.name}</span></div><div className="cafe-banner"><div><p className="eyebrow">SAÇAKLY / {t.menu}</p><h1>{cafe.name}</h1><p>{cafe.description || t.cafeText}</p></div><div className="banner-symbol" aria-hidden="true">✳</div></div>{rewards && <CafeOffers rewards={rewards} locale={locale} />}<MenuCart cafe={cafe} categories={categories} locale={locale} /></main>; }
