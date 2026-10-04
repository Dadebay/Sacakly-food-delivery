import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Checkout } from "@/features/checkout";
import { isLocale } from "@/shared/i18n";
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; if (!isLocale(locale)) notFound(); return <Checkout locale={locale} />; }
