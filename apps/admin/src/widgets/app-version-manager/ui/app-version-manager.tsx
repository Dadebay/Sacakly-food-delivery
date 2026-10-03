import { useState } from "react";
import { useAppVersions } from "@/src/entities/app-version";
import { AppVersionForm } from "./app-version-form";
import "./app-version-manager.css";

export function AppVersionManager() {
  const versions = useAppVersions();
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <section className="app-version-manager" data-testid="app-version-manager">
      <header className="app-version-heading">
        <span className="eyebrow">Настройки</span>
        <h1>Версии приложения</h1>
        <p>
          Сначала опубликуйте обновление в магазине. Затем укажите последнюю
          версию. Повышайте минимальную только тогда, когда старые сборки больше
          не могут работать корректно.
        </p>
      </header>
      {saved && (
        <p
          className="app-version-success"
          role="status"
          data-testid="app-version-save-success"
        >
          Настройки {saved} сохранены. Приложение получит их при следующей
          проверке.
        </p>
      )}
      {versions.isPending && (
        <p role="status" data-testid="app-version-loading">
          Загружаем настройки…
        </p>
      )}
      {versions.isError && (
        <div role="alert" data-testid="app-version-load-error">
          <p>Не удалось загрузить настройки: {versions.error.message}</p>
          <button
            type="button"
            className="secondary-button"
            data-testid="app-version-retry"
            onClick={() => void versions.refetch()}
          >
            Повторить
          </button>
        </div>
      )}
      {versions.data && (
        <div className="app-version-grid">
          {(["ANDROID", "IOS"] as const).map((platform) => {
            const current = versions.data.find(
              (record) => record.platform === platform,
            );
            return (
              <AppVersionForm
                key={`${platform}:${current?.version ?? 0}`}
                platform={platform}
                current={current}
                onSaved={() =>
                  setSaved(platform === "ANDROID" ? "Android" : "iOS")
                }
                onReload={() => {
                  setSaved(null);
                  void versions.refetch();
                }}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
