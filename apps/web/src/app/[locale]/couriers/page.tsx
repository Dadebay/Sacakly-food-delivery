import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CourierApply } from "@/features/courier-apply";
import { copy, isLocale } from "@/shared/i18n";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> { const { locale } = await params; return isLocale(locale) ? { title: copy[locale].courierTitle, description: copy[locale].courierText, alternates: { canonical: `/${locale}/couriers` } } : {}; }
export default async function CouriersPage({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; if (!isLocale(locale)) notFound(); return <CourierApply locale={locale} />; }
