import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  useNotificationCampaigns,
  type NotificationCampaign,
  type NotificationCampaignStatus,
} from "@/src/entities/notification";
import { useNotificationActions } from "@/src/features/notification-management";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel } from "@/src/shared/ui";
import {
  notificationFormSchema,
  type NotificationFormInput,
  type NotificationFormValues,
} from "../model/notification-form";

const statusView: Record<
  NotificationCampaignStatus,
  { label: string; tone: string }
> = {
  PENDING: { label: "В очереди", tone: "amber" },
  SENDING: { label: "Отправляется", tone: "blue" },
  SENT: { label: "Отправлено", tone: "green" },
  PARTIAL: { label: "Частично", tone: "orange" },
  FAILED: { label: "Ошибка", tone: "red" },
};

function creatorName(campaign: NotificationCampaign) {
  return (
    [campaign.createdBy.firstName, campaign.createdBy.lastName]
      .filter(Boolean)
      .join(" ") || campaign.createdBy.phone
  );
}

function createdAt(campaign: NotificationCampaign) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(campaign.createdAt));
}

function NotificationHistoryCard({
  campaign,
  isRetryPending,
  onRetry,
}: {
  campaign: NotificationCampaign;
  isRetryPending: boolean;
  onRetry: () => void;
}) {
  const status = statusView[campaign.status];
  const isTopic = campaign.audience === "ALL_APP_INSTALLATIONS";
  const canRetry = ["FAILED", "PARTIAL"].includes(campaign.status);

  return (
    <article
      className="notification-history-card"
      data-testid={`notification-history-card-${campaign.id}`}
    >
      <header className="notification-history-card-head">
        <div className="notification-history-message">
          <span aria-hidden="true" className="notification-history-icon">
            ✦
          </span>
          <div>
            <h3>{campaign.title}</h3>
            <p>{campaign.body}</p>
            {campaign.deepLink && (
              <code title={campaign.deepLink}>{campaign.deepLink}</code>
            )}
          </div>
        </div>
        <span className={`status-pill ${status.tone}`}>
          <i />
          {isTopic && campaign.status === "SENT"
            ? "Принято к отправке"
            : status.label}
        </span>
      </header>

      <dl className="notification-history-metrics">
        <div>
          <dt>Аудитория</dt>
          <dd>
            {isTopic
              ? "Все устройства"
              : `${campaign.intendedUserCount} клиентов`}
          </dd>
          <small>
            {isTopic
              ? "Включая гостей без регистрации"
              : `${campaign.deviceCount} устройств`}
          </small>
        </div>
        <div>
          <dt>{isTopic ? "Получили сообщение" : "Доставлено"}</dt>
          <dd>{isTopic ? "Количество неизвестно" : campaign.sentCount}</dd>
          <small className={(campaign.failedCount ?? 0) > 0 ? "is-alert" : ""}>
            {isTopic
              ? "Статус отправки не подтверждает доставку каждому"
              : (campaign.failedCount ?? 0) > 0
                ? `${campaign.failedCount} с ошибкой`
                : "Без ошибок"}
          </small>
        </div>
        <div>
          <dt>Создано</dt>
          <dd>{createdAt(campaign)}</dd>
          <small>{creatorName(campaign)}</small>
        </div>
      </dl>

      <footer className="notification-history-card-footer">
        <span>
          {isTopic && canRetry
            ? "Повторная отправка может привести к повторному уведомлению."
            : "Результат обновляется автоматически."}
        </span>
        {canRetry && (
          <button
            className="secondary-button compact"
            data-testid={`notification-retry-${campaign.id}`}
            disabled={isRetryPending}
            type="button"
            onClick={onRetry}
          >
            Повторить отправку
          </button>
        )}
      </footer>
    </article>
  );
}

export function NotificationManager() {
  const [page, setPage] = useState(1);
  const [showComposer, setShowComposer] = useState(false);
  const campaigns = useNotificationCampaigns(page);
  const actions = useNotificationActions();
  const composerRef = useRef<HTMLFormElement>(null);
  const creationRequest = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NotificationFormInput, unknown, NotificationFormValues>({
    resolver: zodResolver(notificationFormSchema),
    mode: "onBlur",
    defaultValues: {
      title: "",
      body: "",
      deepLink: "",
      audience: "ALL_CUSTOMERS",
    },
  });

  const audience = useWatch({ control, name: "audience" });
  const isTopic = audience === "ALL_APP_INSTALLATIONS";

  useEffect(() => {
    if (!showComposer) return;

    composerRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !actions.create.isPending) {
        setShowComposer(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actions.create.isPending, showComposer]);

  async function submit(values: NotificationFormValues) {
    const fingerprint = JSON.stringify(values);
    if (creationRequest.current?.fingerprint !== fingerprint) {
      creationRequest.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      await actions.create.mutateAsync({
        ...values,
        idempotencyKey: creationRequest.current.key,
      });
      creationRequest.current = null;
      reset();
      setPage(1);
      setShowComposer(false);
    } catch {
      // Keep the draft and request key: retrying after a network failure is safe.
    }
  }

  const mutationError = actions.create.error || actions.retry.error;

  return (
    <section
      className="admin-section notification-section"
      data-testid="notification-manager"
    >
      <header className="section-head" data-testid="notification-header">
        <div>
          <h1>Рассылки</h1>
          <p>
            Отправляйте важные сообщения в приложение и следите за результатом
            доставки.
          </p>
        </div>
        <div className="header-actions section-header-actions">
          <button
            className="primary-button"
            data-testid="notification-form-open"
            type="button"
            onClick={() => {
              actions.create.reset();
              setShowComposer(true);
            }}
          >
            + Новая рассылка
          </button>
        </div>
      </header>

      {showComposer && (
        <div
          className="modal-backdrop"
          data-testid="notification-form-backdrop"
          onMouseDown={(event) => {
            if (
              !actions.create.isPending &&
              event.target === event.currentTarget
            ) {
              setShowComposer(false);
            }
          }}
        >
          <section
            aria-labelledby="notification-form-title"
            aria-modal="true"
            className="modal notification-editor notification-compose-modal"
            role="dialog"
          >
            <form
              data-testid="notification-form"
              noValidate
              ref={composerRef}
              onSubmit={(event) => void handleSubmit(submit)(event)}
            >
              <header className="modal-head notification-composer-header">
                <div className="notification-composer-title">
                  <span
                    aria-hidden="true"
                    className="notification-composer-icon"
                  >
                    ✦
                  </span>
                  <div>
                    <h2 id="notification-form-title">Новое сообщение</h2>
                    <p>
                      Выберите получателей и проверьте текст перед отправкой.
                    </p>
                  </div>
                </div>
                <button
                  aria-label="Закрыть"
                  className="modal-close"
                  data-testid="notification-form-close"
                  disabled={actions.create.isPending}
                  type="button"
                  onClick={() => setShowComposer(false)}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M6 6l8 8M14 6l-8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.9"
                    />
                  </svg>
                </button>
              </header>
              <div className="form-grid notification-form-grid">
                <label className="wide-field">
                  <span>Получатели</span>
                  <select
                    data-testid="notification-audience"
                    {...register("audience")}
                    disabled={actions.create.isPending}
                  >
                    <option value="ALL_CUSTOMERS">
                      Зарегистрированные клиенты
                    </option>
                    <option value="ALL_APP_INSTALLATIONS">
                      Все устройства, включая гостей
                    </option>
                  </select>
                  <FormFieldError message={errors.audience?.message} />
                  <small data-testid="notification-audience-description">
                    {isTopic
                      ? "Общее объявление всем подписанным устройствам, даже без входа. Не добавляйте персональные данные. В истории клиента оно не сохраняется."
                      : "Сообщение сохраняется в истории всех активных клиентов; push получают их зарегистрированные устройства."}
                  </small>
                </label>
              </div>
              <div className="form-grid notification-form-grid">
                <label>
                  <span>Заголовок</span>
                  <input
                    data-testid="notification-title"
                    {...register("title")}
                    aria-invalid={Boolean(errors.title)}
                    maxLength={160}
                    placeholder="Например: Заказ уже рядом"
                  />
                  <FormFieldError message={errors.title?.message} />
                </label>
                <label>
                  <span>Открыть экран после нажатия — необязательно</span>
                  <input
                    data-testid="notification-deep-link"
                    {...register("deepLink")}
                    aria-invalid={Boolean(errors.deepLink)}
                    maxLength={500}
                    placeholder="/orders/current"
                  />
                  <FormFieldError message={errors.deepLink?.message} />
                </label>
                <label className="wide-field">
                  <span>Текст уведомления</span>
                  <textarea
                    data-testid="notification-body"
                    {...register("body")}
                    aria-invalid={Boolean(errors.body)}
                    maxLength={1000}
                    rows={5}
                    placeholder="Коротко объясните клиенту, что произошло"
                  />
                  <FormFieldError message={errors.body?.message} />
                </label>
              </div>
              {actions.create.error && (
                <div
                  className="inline-alert"
                  role="alert"
                  data-testid="notification-create-error"
                >
                  {actions.create.error.message}
                </div>
              )}
              <div className="notification-send-row">
                <div className="notification-send-note">
                  <strong>Проверьте текст перед отправкой</strong>
                  <span>
                    {isTopic
                      ? "Рассылка начнётся сразу. Число получателей неизвестно."
                      : "Рассылка начнётся сразу; сообщение сохранится в истории клиентов."}
                  </span>
                </div>
                <button
                  className="primary-button"
                  data-testid="notification-send"
                  disabled={actions.create.isPending}
                  type="submit"
                >
                  {actions.create.isPending
                    ? "Отправляем…"
                    : "Отправить рассылку"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {actions.create.isSuccess && (
        <div className="inline-success" role="status">
          Рассылка «{actions.create.data.title}» запланирована.
        </div>
      )}
      {mutationError && !showComposer && (
        <div className="inline-alert" role="alert">
          {mutationError.message}
        </div>
      )}

      <article className="table-card notification-history">
        <div className="card-title">
          <div>
            <h2>История рассылок</h2>
            <small>
              Здесь отображается результат отправки каждого сообщения.
            </small>
          </div>
          <span aria-label={`Всего рассылок: ${campaigns.data?.total ?? 0}`}>
            {campaigns.data?.total ?? 0}
          </span>
        </div>
        <AsyncPanel
          pending={campaigns.isPending}
          error={campaigns.error}
          onRetry={() => void campaigns.refetch()}
        >
          {campaigns.data?.items.length ? (
            <div
              aria-label="История рассылок"
              className="notification-history-list"
            >
              {campaigns.data.items.map((campaign) => (
                <NotificationHistoryCard
                  campaign={campaign}
                  isRetryPending={actions.retry.isPending}
                  key={campaign.id}
                  onRetry={() => actions.retry.mutate(campaign.id)}
                />
              ))}
            </div>
          ) : (
            <div className="notification-history-empty">Рассылок пока нет.</div>
          )}
          {(campaigns.data?.pages ?? 0) > 1 && (
            <div className="table-pagination">
              <span>
                Страница {page} из {campaigns.data?.pages}
              </span>
              <div>
                <button
                  className="secondary-button compact"
                  data-testid="notification-page-previous"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                  type="button"
                >
                  Назад
                </button>
                <button
                  className="secondary-button compact"
                  data-testid="notification-page-next"
                  disabled={page === campaigns.data?.pages}
                  onClick={() => setPage((value) => value + 1)}
                  type="button"
                >
                  Далее
                </button>
              </div>
            </div>
          )}
        </AsyncPanel>
      </article>
    </section>
  );
}
