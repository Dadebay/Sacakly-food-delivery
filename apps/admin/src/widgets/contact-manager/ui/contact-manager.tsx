import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useContactSettings } from "@/src/entities/contact";
import { useContactSettingsActions } from "@/src/features/contact-settings";
import {
  digitsFromPhone,
  FormFieldError,
  PHONE_PREFIX,
  PhoneNumberInput,
} from "@/src/shared/forms";
import { AsyncPanel } from "@/src/shared/ui";
import {
  contactFormSchema,
  type ContactFormInput,
  type ContactFormValues,
} from "../model/contact-form";
import {
  LinkIcon,
  MailIcon,
  PhoneIcon,
  StorefrontIcon,
  TelegramIcon,
} from "./contact-field-icons";

export function ContactManager() {
  const contactSettings = useContactSettings();
  const actions = useContactSettingsActions();
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = useForm<ContactFormInput, unknown, ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    mode: "onBlur",
    defaultValues: {
      displayName: "",
      phone: "",
      telegram: "",
      email: "",
      privacyLink: "",
      userAgreementLink: "",
    },
  });
  const phone = useWatch({ control, name: "phone" });

  useEffect(() => {
    const value = contactSettings.data;
    if (!value || isDirty) return;
    reset({
      displayName: value.displayName,
      phone: value.phone,
      telegram: value.telegram ?? "",
      email: value.email ?? "",
      privacyLink: value.privacyLink ?? "",
      userAgreementLink: value.userAgreementLink ?? "",
    });
  }, [contactSettings.data, isDirty, reset]);

  function handleLocalNumberChange(digits: string) {
    setValue("phone", digits ? `${PHONE_PREFIX}${digits}` : "", {
      shouldDirty: true,
    });
  }

  async function submit(values: ContactFormValues) {
    await actions.updateContactSettings.mutateAsync(values);
    reset(values);
  }

  return (
    <section className="admin-section" data-testid="contact-manager">
      <header className="section-head" data-testid="contact-header">
        <div>
          <h1>Контакты</h1>
          <p>
            Укажите контакты, которые увидят клиенты в приложении и на странице
            поддержки.
          </p>
        </div>
      </header>

      <AsyncPanel
        pending={contactSettings.isPending}
        error={contactSettings.error}
        onRetry={() => void contactSettings.refetch()}
      >
        {contactSettings.data && (
          <form
            className="editor-card contact-editor"
            data-testid="contact-settings-form"
            noValidate
            onSubmit={handleSubmit(submit)}
          >
            <div className="editor-title">
              <div>
                <h2>Данные для связи</h2>
                <p>Телефон и название обязательны. Остальные поля можно оставить пустыми.</p>
              </div>
            </div>

            <fieldset className="contact-group">
              <legend className="contact-group-title">Обязательные данные</legend>
              <div className="form-grid contact-fields">
                <label>
                  <span className="field-label">Название поддержки</span>
                  <span className="field-icon-input">
                    <StorefrontIcon />
                    <input
                      data-testid="contact-display-name"
                      {...register("displayName")}
                      autoComplete="organization"
                    />
                  </span>
                  <FormFieldError message={errors.displayName?.message} />
                </label>
                <label>
                  <span className="field-label">Телефон</span>
                  <PhoneNumberInput
                    testId="contact-phone"
                    value={digitsFromPhone(phone)}
                    onChange={handleLocalNumberChange}
                    onBlur={() => void trigger("phone")}
                    icon={<PhoneIcon />}
                  />
                  <FormFieldError message={errors.phone?.message} />
                </label>
              </div>
            </fieldset>

            <fieldset className="contact-group contact-group-optional">
              <legend className="contact-group-title">
                Дополнительно
                <span className="contact-group-badge">необязательно</span>
              </legend>
              <div className="form-grid contact-fields">
                <label>
                  <span className="field-label">Telegram</span>
                  <span className="field-icon-input">
                    <TelegramIcon />
                    <input
                      data-testid="contact-telegram"
                      {...register("telegram")}
                      placeholder="@alowalow"
                    />
                  </span>
                  <FormFieldError message={errors.telegram?.message} />
                </label>
                <label>
                  <span className="field-label">Email</span>
                  <span className="field-icon-input">
                    <MailIcon />
                    <input
                      data-testid="contact-email"
                      {...register("email")}
                      autoComplete="email"
                      inputMode="email"
                    />
                  </span>
                  <FormFieldError message={errors.email?.message} />
                </label>
                <label className="wide-field">
                  <span className="field-label">Ссылка на политику конфиденциальности</span>
                  <span className="field-icon-input">
                    <LinkIcon />
                    <input
                      data-testid="contact-privacy-link"
                      {...register("privacyLink")}
                      inputMode="url"
                      placeholder="https://…"
                    />
                  </span>
                  <FormFieldError message={errors.privacyLink?.message} />
                </label>
                <label className="wide-field">
                  <span className="field-label">Ссылка на пользовательское соглашение</span>
                  <span className="field-icon-input">
                    <LinkIcon />
                    <input
                      data-testid="contact-user-agreement-link"
                      {...register("userAgreementLink")}
                      inputMode="url"
                      placeholder="https://…"
                    />
                  </span>
                  <FormFieldError message={errors.userAgreementLink?.message} />
                </label>
              </div>
            </fieldset>

            {actions.updateContactSettings.error && (
              <div className="inline-alert" role="alert">
                {actions.updateContactSettings.error instanceof Error
                  ? actions.updateContactSettings.error.message
                  : "Не удалось сохранить контакты."}
              </div>
            )}
            {actions.updateContactSettings.isSuccess && !isDirty && (
              <div className="inline-success" role="status">
                Контакты сохранены.
              </div>
            )}

            <div className="contact-editor-footer">
              <span className="contact-editor-hint">
                {isDirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
              </span>
              <button
                className="primary-button"
                data-testid="contact-save"
                disabled={actions.updateContactSettings.isPending || !isDirty}
                type="submit"
              >
                {actions.updateContactSettings.isPending ? "Сохраняем…" : "Сохранить контакты"}
              </button>
            </div>
          </form>
        )}
      </AsyncPanel>
    </section>
  );
}
