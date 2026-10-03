import { useState, type FormEvent } from "react";
import { api, type Session } from "../api/client";

export function Login({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      if (step === "phone") {
        await api.requestOtp(phone.trim());
        setStep("code");
      } else {
        onSuccess(await api.verifyOtp(phone.trim(), code.trim()));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally { setPending(false); }
  }

  return <main className="login-layout">
    <div className="login-story">
      <span className="story-orbit" aria-hidden="true">✳</span>
      <p className="eyebrow">AlowLink / партнёрам</p>
      <h1>Каждый заказ<br /><em>на своём месте.</em></h1>
      <p>Отдельный кабинет для кафе. Единая сеть курьеров. Всё под вашим контролем.</p>
      <div className="story-points"><span>01 / Ваше меню</span><span>02 / Ваши заказы</span><span>03 / Общая доставка</span></div>
    </div>
    <div className="login-card" data-testid="merchant-login-card">
      <div className="card-kicker">Вход для партнёров</div>
      <h2>{step === "phone" ? "Рады видеть вас" : "Проверьте SMS"}</h2>
      <p>{step === "phone" ? "Используйте номер, который владелец подключил к вашему кафе." : `Мы отправили код на ${phone}.`}</p>
      <form onSubmit={submit} data-testid="merchant-login-form">
        {step === "phone" ? <label>Номер телефона
          <input autoFocus type="tel" inputMode="tel" autoComplete="tel" placeholder="+993 6X XX XX XX" value={phone} onChange={(event) => setPhone(event.target.value)} required data-testid="merchant-phone-input" />
        </label> : <label>Код из SMS
          <input autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,6}" maxLength={6} placeholder="••••••" value={code} onChange={(event) => setCode(event.target.value)} required data-testid="merchant-code-input" />
        </label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={pending} type="submit" data-testid="merchant-login-submit">{pending ? "Подождите…" : step === "phone" ? "Получить код" : "Войти"}<span aria-hidden="true">↗</span></button>
        {step === "code" && <button className="text-button back-button" type="button" onClick={() => { setStep("phone"); setCode(""); }} data-testid="merchant-change-phone">Изменить номер</button>}
      </form>
      <p className="login-note">Доступ к данным кафе проверяется при каждом запросе.</p>
    </div>
  </main>;
}
