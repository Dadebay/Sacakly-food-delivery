import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { AppPlatform, AppVersion } from "@/src/entities/app-version";
import { useSaveAppVersion } from "@/src/features/app-version-management";
import { ApiError } from "@/src/shared/api/api-client";
import { FormFieldError } from "@/src/shared/forms";
import {
  appVersionFormSchema,
  compareVersions,
  versionTestId,
  type AppVersionFormValues,
} from "../model/app-version-form";
import { MinimumVersionDialog } from "./minimum-version-dialog";

export function AppVersionForm({
  platform,
  current,
  onSaved,
  onReload,
}: {
  platform: AppPlatform;
  current?: AppVersion;
  onSaved: () => void;
  onReload: () => void;
}) {
  const action = useSaveAppVersion();
  const [confirmation, setConfirmation] = useState<AppVersionFormValues | null>(
    null,
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AppVersionFormValues>({
    resolver: zodResolver(appVersionFormSchema),
    mode: "onSubmit",
    defaultValues: {
      platform,
      latestVersion: current?.latestVersion ?? "",
      minSupportedVersion: current?.minSupportedVersion ?? "",
      storeUrl:
        current?.storeUrl ??
        (platform === "ANDROID"
          ? "https://play.google.com/store/apps/details?id=com.gurbanov.alowalow"
          : ""),
      releaseNotesRu: current?.releaseNotesRu ?? "",
      releaseNotesTk: current?.releaseNotesTk ?? "",
      publishedConfirmed: false,
    },
  });
  const id = (name: string) => versionTestId(platform, name);
  const conflict =
    action.error instanceof ApiError && action.error.status === 409;
  const save = (values: AppVersionFormValues, confirmed: boolean) => {
    action.mutate(
      {
        platform,
        body: {
          latestVersion: values.latestVersion,
          minSupportedVersion: values.minSupportedVersion,
          storeUrl: values.storeUrl,
          publishedConfirmed: true,
          version: current?.version ?? 0,
          confirmMinimumIncrease: confirmed,
          releaseNotesRu: values.releaseNotesRu || null,
          releaseNotesTk: values.releaseNotesTk || null,
        },
      },
      {
        onSuccess: () => {
          setConfirmation(null);
          onSaved();
        },
      },
    );
  };
  const submit = (values: AppVersionFormValues) => {
    action.reset();
    if (
      compareVersions(
        values.minSupportedVersion,
        current?.minSupportedVersion ?? "0.0.0",
      ) > 0
    )
      setConfirmation(values);
    else save(values, false);
  };
  return (
    <section className="app-version-card" data-testid={id("card")}>
      <header className="app-version-card-head">
        <h2>{platform === "ANDROID" ? "Android" : "iOS"}</h2>
        <span
          className={`app-version-status ${current ? "is-configured" : ""}`}
        >
          {current ? "Настроено" : "Не настроено"}
        </span>
      </header>
      <p className="app-version-help">
        {current
          ? `Сейчас: последняя ${current.latestVersion}, минимальная ${current.minSupportedVersion}.`
          : "Проверка обновления пока не ограничивает запуск приложения."}
      </p>
      <form noValidate data-testid={id("form")} onSubmit={handleSubmit(submit)}>
        <input
          type="hidden"
          data-testid={id("platform")}
          {...register("platform")}
        />
        <fieldset disabled={action.isPending || Boolean(confirmation)}>
          <div className="app-version-fields">
            <label>
              Последняя версия
              <input
                data-testid={id("latest")}
                autoComplete="off"
                placeholder="1.4.0"
                aria-invalid={Boolean(errors.latestVersion)}
                {...register("latestVersion")}
              />
              <FormFieldError message={errors.latestVersion?.message} />
            </label>
            <label>
              Минимальная версия
              <input
                data-testid={id("minimum")}
                autoComplete="off"
                placeholder="1.2.0"
                aria-invalid={Boolean(errors.minSupportedVersion)}
                {...register("minSupportedVersion")}
              />
              <FormFieldError message={errors.minSupportedVersion?.message} />
            </label>
          </div>
          <p className="app-version-help">
            Версия без номера сборки: 1.4.0. Повышение минимальной версии
            блокирует старые сборки.
          </p>
          <label>
            Ссылка на {platform === "ANDROID" ? "Google Play" : "App Store"}
            <input
              type="url"
              data-testid={id("store")}
              autoComplete="off"
              placeholder={
                platform === "IOS"
                  ? "https://apps.apple.com/app/id…"
                  : "https://play.google.com/…"
              }
              aria-invalid={Boolean(errors.storeUrl)}
              {...register("storeUrl")}
            />
            <FormFieldError message={errors.storeUrl?.message} />
          </label>
          <label>
            Что нового — RU
            <textarea
              rows={3}
              data-testid={id("notes-ru")}
              maxLength={5000}
              {...register("releaseNotesRu")}
            />
            <FormFieldError message={errors.releaseNotesRu?.message} />
          </label>
          <label>
            Что нового — TK
            <textarea
              rows={3}
              data-testid={id("notes-tk")}
              maxLength={5000}
              {...register("releaseNotesTk")}
            />
            <FormFieldError message={errors.releaseNotesTk?.message} />
          </label>
          <label className="app-version-publication">
            <input
              type="checkbox"
              data-testid={id("published")}
              {...register("publishedConfirmed")}
            />
            <span>
              Проверено: указанная последняя версия доступна всем пользователям
              в магазине, публикация и поэтапная раскатка завершены.
            </span>
          </label>
          <FormFieldError message={errors.publishedConfirmed?.message} />
          <button
            className="primary-button"
            type="submit"
            data-testid={id("save")}
            disabled={action.isPending || conflict}
          >
            {action.isPending ? "Сохраняем…" : "Сохранить"}
          </button>
        </fieldset>
        {action.error && !confirmation && (
          <p className="form-error" role="alert" data-testid={id("error")}>
            {conflict
              ? "Настройки изменились. Обновите данные и повторите изменения."
              : action.error.message}
          </p>
        )}
        {conflict && !confirmation && (
          <button
            type="button"
            className="secondary-button"
            data-testid={id("reload")}
            onClick={onReload}
          >
            Обновить данные
          </button>
        )}
      </form>
      {confirmation && (
        <MinimumVersionDialog
          minimum={confirmation.minSupportedVersion}
          pending={action.isPending}
          error={action.error?.message}
          onCancel={() => {
            setConfirmation(null);
            if (!conflict) action.reset();
          }}
          onConfirm={() => save(confirmation, true)}
        />
      )}
    </section>
  );
}
