import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { Header } from "@/widgets/header";
import { copy, isLocale, locales } from "@/shared/i18n";
import { ServiceWorker } from "@/features/service-worker";

export function generateStaticParams() { return locales.map((locale) => ({ locale })); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  const title = `Saçakly — ${copy[locale].heroTag}`;
  return { title: { default: title, template: `%s · Saçakly` }, description: copy[locale].heroText,
    icons: { icon: "/icon.svg" },
    metadataBase: new URL(url || "http://localhost:3000"),
    robots: url?.startsWith("https://") ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: `/${locale}`, languages: Object.fromEntries(locales.map((entry) => [entry, `/${entry}`])) },
    openGraph: { type: "website", locale, title, description: copy[locale].heroText, siteName: "Saçakly" },
  };
}
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <html lang={locale} data-scroll-behavior="smooth"><body><Header locale={locale} />{children}<footer className="site-footer"><div className="container footer-content"><span className="footer-logo">Saçakly<span>•</span></span><span>{copy[locale].heroTag}</span><a href={`/${locale}/couriers`}>{copy[locale].courier}</a></div></footer><ServiceWorker /></body></html>;
}
