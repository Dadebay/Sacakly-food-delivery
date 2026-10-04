"use client";
import { useState, type FormEvent } from "react";
import { customerApi, type Session } from "@/shared/api";
import { copy, type Locale } from "@/shared/i18n";
export function OtpLogin({ locale, onSuccess }: { locale: Locale; onSuccess: (session: Session) => void }) {
  const t = copy[locale]; const [phone, setPhone] = useState("+993"); const [code, setCode] = useState(""); const [sent, setSent] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setPending(true); setError(""); try { if (!sent) { await customerApi.requestOtp(phone); setSent(true); } else onSuccess(await customerApi.verifyOtp(phone, code)); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setPending(false); } }
  return <form className="auth-form" onSubmit={submit}><label>{t.phone}<input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" required /></label>{sent && <label>{t.code}<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" minLength={4} maxLength={6} required /></label>}{error && <p role="alert" className="error">{error}</p>}<button className="button button-red" disabled={pending}>{pending ? "…" : sent ? t.signIn : t.sendCode}</button></form>;
}
