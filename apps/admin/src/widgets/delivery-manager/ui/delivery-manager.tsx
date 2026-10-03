import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Controller, useForm, useWatch } from "react-hook-form";
import {
  flattenDeliveryEtraps,
  useAdminDeliveryConfig,
  type DeliveryConfig,
  type DeliveryEtrapWithWelayat,
  type DeliveryZonePoint,
  type DeliveryZoneSuggestion,
  type DeliveryWelayat,
} from "@/src/entities/delivery";
import { useDeliveryActions } from "@/src/features/delivery-management";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, DataTable, EditIcon, PowerIcon } from "@/src/shared/ui";
import {
  deliveryEtrapFormSchema,
  deliverySettingsFormSchema,
  deliveryWelayatFormSchema,
  type DeliveryEtrapFormInput,
  type DeliveryEtrapFormValues,
  type DeliverySettingsFormInput,
  type DeliverySettingsFormValues,
  type DeliveryWelayatFormInput,
  type DeliveryWelayatFormValues,
} from "../model/delivery-form";
import {
  createStarterDeliveryZone,
  findExistingZoneForSuggestion,
  findWelayatForZoneSuggestion,
} from "../model/delivery-zone-editor";

import { NightDeliverySchedule } from "./night-delivery-schedule";
import { DistancePriceTiers } from "./distance-price-tiers";

const DeliveryZoneMap = lazy(() =>
  import("./delivery-zone-map").then((module) => ({
    default: module.DeliveryZoneMap,
  })),
);

type WelayatEditor =
  { mode: "create" } | { mode: "edit"; welayat: DeliveryWelayat };
type EtrapEditor =
  { mode: "create" } | { mode: "edit"; etrap: DeliveryEtrapWithWelayat };

function money(value: number) {
  return `${value.toFixed(2)} TMT`;
}

export function DeliveryManager() {
  const config = useAdminDeliveryConfig();
  const actions = useDeliveryActions();
  const [search, setSearch] = useState("");
  const [welayatEditor, setWelayatEditor] = useState<WelayatEditor | null>(
    null,
  );
  const [etrapEditor, setEtrapEditor] = useState<EtrapEditor | null>(null);
  const [zoneDraft, setZoneDraft] = useState<DeliveryZonePoint[]>([]);
  const [zoneError, setZoneError] = useState("");
  const [zoneDiscoveryMode, setZoneDiscoveryMode] = useState(false);
  const [zoneAssistantMessage, setZoneAssistantMessage] = useState("");
  const [mapZoneSelectionMode, setMapZoneSelectionMode] = useState(false);
  const [mapZoneSelectionMessage, setMapZoneSelectionMessage] = useState("");
  const [zoneFitRevision, setZoneFitRevision] = useState(0);
  const zoneLookupSequence = useRef(0);
  const welayatFormRef = useRef<HTMLFormElement>(null);
  const etrapFormRef = useRef<HTMLFormElement>(null);
  const {
    register: registerSettings,
    control: settingsControl,
    handleSubmit: handleSettingsSubmit,
    reset: resetSettings,
    getValues: getSettingsValues,
    setFocus: focusSettings,
    formState: { errors: settingsErrors, isDirty: settingsDirty },
  } = useForm<DeliverySettingsFormInput, unknown, DeliverySettingsFormValues>({
    resolver: zodResolver(deliverySettingsFormSchema),
    mode: "onBlur",
    defaultValues: {
      mapPricingEnabled: false,
      distancePricingEnabled: false,
      dayPricePerKilometer: "5.00",
      nightPricePerKilometer: "5.00",
      distancePriceTiers: [],
      fallbackPrice: "15.00",
      fallbackNightPrice: "15.00",
      fallbackNightFreeDeliveryThreshold: "150.00",
      fallbackFreeDeliveryThreshold: "150.00",
    },
  });
  const distancePricing = useWatch({ control: settingsControl, name: "distancePricingEnabled" });
  const {
    register: registerWelayat,
    handleSubmit: handleWelayatSubmit,
    reset: resetWelayat,
    formState: { errors: welayatErrors },
  } = useForm<DeliveryWelayatFormInput, unknown, DeliveryWelayatFormValues>({
    resolver: zodResolver(deliveryWelayatFormSchema),
    mode: "onBlur",
    defaultValues: { nameEn: "", nameRu: "", nameTk: "", sortOrder: "0" },
  });
  const {
    register: registerEtrap,
    handleSubmit: handleEtrapSubmit,
    reset: resetEtrap,
    setValue: setEtrapValue,
    formState: { errors: etrapErrors },
  } = useForm<DeliveryEtrapFormInput, unknown, DeliveryEtrapFormValues>({
    resolver: zodResolver(deliveryEtrapFormSchema),
    mode: "onBlur",
    defaultValues: {
      welayatId: "",
      nameEn: "",
      nameRu: "",
      nameTk: "",
      queuePosition: "",
      price: "15.00",
      nightPrice: "15.00",
      nightFreeDeliveryThreshold: "150.00",
      freeDeliveryThreshold: "150.00",
      isDeliveryEnabled: false,
    },
  });

  const loadSettings = useCallback((data: DeliveryConfig) => {
    resetSettings({
      version: data.version,
      mapPricingEnabled: data.mapPricingEnabled,
      distancePricingEnabled: data.distancePricingEnabled,
      dayPricePerKilometer: data.dayPricePerKilometer?.toFixed(2) ?? "5.00",
      nightPricePerKilometer: data.nightPricePerKilometer?.toFixed(2) ?? "5.00",
      distancePriceTiers: (data.distancePriceTiers ?? []).map((tier) => ({
        afterKilometers: String(tier.afterKilometers),
        dayPricePerKilometer: tier.dayPricePerKilometer.toFixed(2),
        nightPricePerKilometer: tier.nightPricePerKilometer.toFixed(2),
      })),
      fallbackPrice: data.fallbackPrice.toFixed(2),
      fallbackNightPrice: data.fallbackNightPrice.toFixed(2),
      fallbackNightFreeDeliveryThreshold:
        data.fallbackNightFreeDeliveryThreshold?.toFixed(2) ?? "",
      fallbackFreeDeliveryThreshold:
        data.fallbackFreeDeliveryThreshold?.toFixed(2) ?? "",
    });
  }, [resetSettings]);

  useEffect(() => {
    if (config.data && !settingsDirty && !actions.updateSettings.isPending) {
      loadSettings(config.data);
    }
  }, [config.data, settingsDirty, actions.updateSettings.isPending, loadSettings]);

  useEffect(() => {
    if (!welayatEditor) return;
    welayatFormRef.current
      ?.querySelector<HTMLElement>("input, select")
      ?.focus();
  }, [welayatEditor]);

  useEffect(() => {
    if (!etrapEditor) return;
    etrapFormRef.current?.querySelector<HTMLElement>("input, select")?.focus();
  }, [etrapEditor]);

  useEffect(() => {
    if (!welayatEditor && !etrapEditor) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setWelayatEditor(null);
      setEtrapEditor(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [welayatEditor, etrapEditor]);

  const allEtraps = useMemo(
    () => flattenDeliveryEtraps(config.data),
    [config.data],
  );
  const tariffZones = useMemo(
    () =>
      allEtraps.filter((etrap) => (etrap.deliveryZone?.length ?? 0) >= 3),
    [allEtraps],
  );
  const visibleEtraps = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ru");
    return allEtraps.filter((etrap) => {
      if (!normalized) return true;
      return [
        etrap.nameRu,
        etrap.nameTk,
        etrap.nameEn ?? "",
        etrap.welayatNameRu,
        etrap.welayatNameTk,
      ].some((value) => value.toLocaleLowerCase("ru").includes(normalized));
    });
  }, [search, allEtraps]);

  const openCreateWelayat = useCallback(() => {
    const sortOrders =
      config.data?.welayats.map(({ sortOrder }) => sortOrder) ?? [];
    const nextSortOrder = Math.max(0, ...sortOrders) + 1;
    setEtrapEditor(null);
    setWelayatEditor({ mode: "create" });
    resetWelayat({
      nameEn: "",
      nameRu: "",
      nameTk: "",
      sortOrder: String(nextSortOrder),
    });
  }, [config.data?.welayats, resetWelayat]);

  const openWelayatEditor = useCallback(
    (welayat: DeliveryWelayat) => {
      setEtrapEditor(null);
      setWelayatEditor({ mode: "edit", welayat });
      resetWelayat({
        nameEn: welayat.nameEn ?? "",
        nameRu: welayat.nameRu,
        nameTk: welayat.nameTk,
        sortOrder: String(welayat.sortOrder),
      });
    },
    [resetWelayat],
  );

  const openCreateEtrap = useCallback(() => {
    const initialWelayatId = String(config.data?.welayats[0]?.id ?? "");
    setWelayatEditor(null);
    setEtrapEditor({ mode: "create" });
    setZoneDraft([]);
    setZoneError("");
    setZoneDiscoveryMode(false);
    setZoneAssistantMessage("");
    zoneLookupSequence.current += 1;
    actions.suggestZone.reset();
    resetEtrap({
      welayatId: initialWelayatId,
      nameEn: "",
      nameRu: "",
      nameTk: "",
      queuePosition: "",
      price: config.data?.fallbackPrice.toFixed(2) ?? "15.00",
      nightPrice: config.data?.fallbackNightPrice.toFixed(2) ?? "15.00",
      nightFreeDeliveryThreshold:
        config.data?.fallbackNightFreeDeliveryThreshold?.toFixed(2) ?? "",
      freeDeliveryThreshold:
        config.data?.fallbackFreeDeliveryThreshold?.toFixed(2) ?? "",
      isDeliveryEnabled: false,
    });
  }, [actions.suggestZone, config.data, resetEtrap]);

  const openEtrapEditor = useCallback(
    (
      etrap: DeliveryEtrapWithWelayat,
      suggestedBoundary?: readonly DeliveryZonePoint[],
    ) => {
      setWelayatEditor(null);
      setEtrapEditor({ mode: "edit", etrap });
      setZoneDraft(
        suggestedBoundary
          ? [...suggestedBoundary]
          : etrap.deliveryZone
            ? [...etrap.deliveryZone]
            : [],
      );
      setZoneError("");
      setZoneDiscoveryMode(false);
      setZoneAssistantMessage("");
      zoneLookupSequence.current += 1;
      actions.suggestZone.reset();
      resetEtrap({
        welayatId: String(etrap.welayatId),
        nameEn: etrap.nameEn ?? "",
        nameRu: etrap.nameRu,
        nameTk: etrap.nameTk,
        queuePosition:
          etrap.queuePosition === null ? "" : String(etrap.queuePosition),
        price: etrap.price.toFixed(2),
        nightPrice: etrap.nightPrice.toFixed(2),
        nightFreeDeliveryThreshold:
          etrap.nightFreeDeliveryThreshold?.toFixed(2) ?? "",
        freeDeliveryThreshold: etrap.freeDeliveryThreshold?.toFixed(2) ?? "",
        isDeliveryEnabled: etrap.isDeliveryEnabled,
      });
    },
    [actions.suggestZone, resetEtrap],
  );

  const openSuggestedZone = useCallback(
    (suggestion: DeliveryZoneSuggestion, approximateBoundary = false) => {
      const boundary = suggestion.boundary ?? [];
      const suggestedWelayat = findWelayatForZoneSuggestion(
        config.data?.welayats ?? [],
        suggestion,
      );
      const existing = findExistingZoneForSuggestion(
        allEtraps,
        suggestion,
        suggestedWelayat?.id,
      );
      if (existing) {
        openEtrapEditor(existing, boundary);
        setZoneFitRevision((revision) => revision + 1);
        setZoneAssistantMessage(
          approximateBoundary
            ? `Для «${existing.nameRu}» нет готовой OSM-границы. Мы создали небольшой черновой контур вокруг точки — растяните его за пронумерованные точки и задайте цену.`
            : `Найдена готовая зона «${existing.nameRu}». Проверьте границу и задайте цену.`,
        );
        return;
      }

      setWelayatEditor(null);
      setEtrapEditor({ mode: "create" });
      setZoneDraft([...boundary]);
      setZoneError("");
      setZoneDiscoveryMode(false);
      setZoneAssistantMessage(
        approximateBoundary
          ? suggestion.label
            ? `Для «${suggestion.label}» нет готовой OSM-границы. Мы создали небольшой черновой контур вокруг точки — растяните его за пронумерованные точки и задайте цену.`
            : "Готовая граница не найдена. Мы создали небольшой черновой контур вокруг точки — растяните его за пронумерованные точки, укажите название и цену."
          : `Найдена зона: ${suggestion.label}. Проверьте границу и задайте цену.`,
      );
      setZoneFitRevision((revision) => revision + 1);
      zoneLookupSequence.current += 1;
      actions.suggestZone.reset();
      resetEtrap({
        welayatId: String(
          suggestedWelayat?.id ?? config.data?.welayats[0]?.id ?? "",
        ),
        nameEn: suggestion.nameEn ?? "",
        nameRu: suggestion.nameRu ?? "",
        nameTk: suggestion.nameTk ?? suggestion.nameRu ?? "",
        queuePosition: "",
        price: config.data?.fallbackPrice.toFixed(2) ?? "15.00",
        nightPrice: config.data?.fallbackNightPrice.toFixed(2) ?? "15.00",
        nightFreeDeliveryThreshold:
          config.data?.fallbackNightFreeDeliveryThreshold?.toFixed(2) ?? "",
        freeDeliveryThreshold:
          config.data?.fallbackFreeDeliveryThreshold?.toFixed(2) ?? "",
        isDeliveryEnabled: false,
      });
    },
    [
      actions.suggestZone,
      allEtraps,
      config.data,
      openEtrapEditor,
      resetEtrap,
    ],
  );

  async function selectTariffZoneFromMap(point: DeliveryZonePoint) {
    if (actions.suggestZone.isPending) return;
    const sequence = zoneLookupSequence.current;
    setMapZoneSelectionMode(false);
    setMapZoneSelectionMessage(
      "Определяем название и замкнутую границу выбранного района…",
    );
    try {
      const suggestion = await actions.suggestZone.mutateAsync(point);
      if (sequence !== zoneLookupSequence.current) return;
      if (!suggestion.label) {
        setMapZoneSelectionMessage("");
        openSuggestedZone(
          {
            ...suggestion,
            boundary: createStarterDeliveryZone(point),
          },
          true,
        );
        return;
      }
      if (!suggestion.boundary || suggestion.boundary.length < 3) {
        setMapZoneSelectionMessage("");
        openSuggestedZone(
          {
            ...suggestion,
            boundary: createStarterDeliveryZone(point),
          },
          true,
        );
        return;
      }
      setMapZoneSelectionMessage("");
      openSuggestedZone(suggestion);
    } catch (reason) {
      if (sequence !== zoneLookupSequence.current) return;
      setMapZoneSelectionMessage(
        reason instanceof Error
          ? reason.message
          : "Не удалось получить границу района. Попробуйте ещё раз.",
      );
    }
  }

  async function discoverZone(point: DeliveryZonePoint) {
    const sequence = zoneLookupSequence.current;
    setZoneDiscoveryMode(false);
    setZoneAssistantMessage("Ищем название и границу района в OpenStreetMap…");
    try {
      const suggestion = await actions.suggestZone.mutateAsync(point);
      if (sequence !== zoneLookupSequence.current || !etrapFormRef.current) {
        return;
      }
      if (!suggestion.label) {
        setZoneDraft(createStarterDeliveryZone(point));
        setZoneFitRevision((revision) => revision + 1);
        setZoneError("");
        setZoneAssistantMessage(
          "Готовая граница не найдена, поэтому создан небольшой черновой контур вокруг точки. Растяните его за пронумерованные точки и укажите название вручную.",
        );
        return;
      }
      if (suggestion.nameRu) {
        setEtrapValue("nameRu", suggestion.nameRu, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (suggestion.nameTk) {
        setEtrapValue("nameTk", suggestion.nameTk, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (suggestion.nameEn) {
        setEtrapValue("nameEn", suggestion.nameEn, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (suggestion.boundary && suggestion.boundary.length >= 3) {
        setZoneDraft(suggestion.boundary);
        setZoneFitRevision((revision) => revision + 1);
        setZoneError("");
        setZoneAssistantMessage(
          `Найдено: ${suggestion.label}. Загружено ${suggestion.boundary.length} точек — границу можно поправить перетаскиванием.`,
        );
      } else {
        setZoneDraft(createStarterDeliveryZone(point));
        setZoneFitRevision((revision) => revision + 1);
        setZoneError("");
        setZoneAssistantMessage(
          `Найдено: ${suggestion.label}. Готовой OSM-границы нет, поэтому создан небольшой черновой контур вокруг точки. Растяните его за пронумерованные точки.`,
        );
      }
    } catch (reason) {
      if (sequence !== zoneLookupSequence.current) return;
      setZoneAssistantMessage(
        reason instanceof Error
          ? reason.message
          : "Не удалось определить район. Попробуйте ещё раз.",
      );
    }
  }

  // Velayat listesi kurulum ekrani: adi, kac rayonu oldugu ve duzenleme
  // dugmesi yeter. Ingilizce ad ile siralama numarasi modalda duruyor,
  // listede yer kaplamalarinin bir karsiligi yok.
  const welayatColumns = useMemo<ColumnDef<DeliveryWelayat, unknown>[]>(
    () => [
      {
        header: "Велаят",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{row.original.nameRu}</strong>
            <small>{row.original.nameTk}</small>
          </div>
        ),
      },
      {
        header: "Районов",
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="count-pill">{row.original.etraps.length}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="row-actions">
            <button
              aria-label="Изменить"
              title="Изменить"
              className="secondary-button compact row-icon-button"
              data-testid={`delivery-welayat-edit-${row.original.id}`}
              type="button"
              onClick={() => openWelayatEditor(row.original)}
            >
              <EditIcon />
            </button>
          </div>
        ),
      },
    ],
    [openWelayatEditor],
  );

  const etrapColumns = useMemo<ColumnDef<DeliveryEtrapWithWelayat, unknown>[]>(
    () => [
      {
        // Panel tek dilli (index.html: lang="ru"), bu yuzden listede yalnizca
        // rusca ad gosteriliyor. Panele dil secimi eklenirse degistirilecek
        // tek yer burasi.
        header: "Район / улица",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>{row.original.nameRu}</strong>
            <small>{row.original.welayatNameRu}</small>
          </div>
        ),
      },
      {
        header: "Цена",
        meta: { align: "end" },
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong className="delivery-price-value">
              День: {money(row.original.price)}
            </strong>
            <small>Ночь: {money(row.original.nightPrice)}</small>
          </div>
        ),
      },
      {
        header: "Бесплатно от",
        meta: { align: "end" },
        cell: ({ row }) => (
          <div className="primary-cell">
            <span>
              День:{" "}
              {row.original.freeDeliveryThreshold === null
                ? "всегда платно"
                : money(row.original.freeDeliveryThreshold)}
            </span>
            <small>
              Ночь:{" "}
              {row.original.nightFreeDeliveryThreshold === null
                ? "всегда платно"
                : money(row.original.nightFreeDeliveryThreshold)}
            </small>
          </div>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span
            className={`state-pill ${
              row.original.isDeliveryEnabled ? "is-on" : "is-off"
            }`}
          >
            {row.original.isDeliveryEnabled ? "Доставка" : "Выключена"}
          </span>
        ),
      },
      {
        header: "Карта",
        cell: ({ row }) => (
          <span
            className={`state-pill ${
              row.original.deliveryZone ? "is-on" : "is-off"
            }`}
          >
            {row.original.deliveryZone
              ? `${row.original.deliveryZone.length} точек`
              : "Без зоны"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="row-actions">
            <button
              aria-label="Изменить"
              title="Изменить"
              className="secondary-button compact row-icon-button"
              data-testid={`delivery-etrap-edit-${row.original.id}`}
              type="button"
              onClick={() => openEtrapEditor(row.original)}
            >
              <EditIcon />
            </button>
            <button
              aria-label={
                row.original.isDeliveryEnabled ? "Отключить" : "Включить"
              }
              title={row.original.isDeliveryEnabled ? "Отключить" : "Включить"}
              className="text-button row-icon-button"
              data-testid={`delivery-etrap-toggle-${row.original.id}`}
              type="button"
              disabled={actions.updateEtrap.isPending}
              onClick={() =>
                actions.updateEtrap.mutate({
                  id: row.original.id,
                  body: {
                    isDeliveryEnabled: !row.original.isDeliveryEnabled,
                  },
                })
              }
            >
              <PowerIcon />
            </button>
          </div>
        ),
      },
    ],
    [actions.updateEtrap, openEtrapEditor],
  );

  async function saveSettings(values: DeliverySettingsFormValues) {
    try {
      await actions.updateSettings.mutateAsync(values);
      resetSettings(getSettingsValues());
    } catch {
      /* The mutation error is displayed above the form. */
    }
  }

  async function saveWelayat(values: DeliveryWelayatFormValues) {
    if (!welayatEditor) return;
    if (welayatEditor.mode === "create") {
      await actions.createWelayat.mutateAsync(values);
    } else {
      await actions.updateWelayat.mutateAsync({
        id: welayatEditor.welayat.id,
        body: values,
      });
    }
    setWelayatEditor(null);
  }

  async function saveEtrap(values: DeliveryEtrapFormValues) {
    if (!etrapEditor) return;
    if (zoneDraft.length > 0 && zoneDraft.length < 3) {
      setZoneError("Поставьте минимум 3 точки или очистите границу полностью.");
      return;
    }
    if (
      values.isDeliveryEnabled &&
      config.data?.mapPricingEnabled &&
      zoneDraft.length < 3
    ) {
      setZoneError(
        "Для включённого района нужна граница, пока расчёт по карте активен.",
      );
      return;
    }
    setZoneError("");
    const body = {
      ...values,
      deliveryZone: zoneDraft.length >= 3 ? zoneDraft : null,
    };
    try {
      if (etrapEditor.mode === "create") {
        await actions.createEtrap.mutateAsync(body);
      } else {
        await actions.updateEtrap.mutateAsync({
          id: etrapEditor.etrap.id,
          body: { ...body, version: etrapEditor.etrap.version },
        });
      }
      setEtrapEditor(null);
    } catch {
      /* Preserve the entered prices and display the mutation error. */
    }
  }

  const mutationError =
    actions.updateSettings.error ||
    actions.createWelayat.error ||
    actions.updateWelayat.error ||
    actions.createEtrap.error ||
    actions.updateEtrap.error;
  const mutationSucceeded =
    actions.updateSettings.isSuccess ||
    actions.createWelayat.isSuccess ||
    actions.updateWelayat.isSuccess ||
    actions.createEtrap.isSuccess ||
    actions.updateEtrap.isSuccess;
  const directoryPending =
    actions.createWelayat.isPending ||
    actions.updateWelayat.isPending ||
    actions.createEtrap.isPending ||
    actions.updateEtrap.isPending;
  // Kapali bir <details> icindeki alanin hatasi gorunmez kalir. Hata varken
  // acik tutuyoruz; hata yokken `undefined` birakip kullanicinin kendi actigi
  // durumu bozmuyoruz.
  const welayatAdvancedError = Boolean(
    welayatErrors.nameEn || welayatErrors.sortOrder,
  );
  const etrapAdvancedError = Boolean(
    etrapErrors.welayatId || etrapErrors.nameEn || etrapErrors.queuePosition,
  );

  return (
    <section
      className="admin-section delivery-manager"
      data-testid="delivery-manager"
    >
      {mutationError && (
        <div className="inline-alert" role="alert">
          {mutationError instanceof Error ? mutationError.message : ""}
          <button
            type="button"
            className="text-button"
            data-testid="delivery-config-reload"
            onClick={async () => {
              const latest = await config.refetch();
              if (latest.data) {
                loadSettings(latest.data);
                actions.updateSettings.reset();
              }
            }}
          >
            Обновить настройки
          </button>
        </div>
      )}
      {mutationSucceeded && !settingsDirty && (
        <div className="success-banner" role="status">
          Настройки доставки сохранены.
        </div>
      )}

      <form
        className="editor-card delivery-settings-card"
        data-testid="delivery-settings-form"
        noValidate
        onSubmit={handleSettingsSubmit(saveSettings)}
      >
        <div className="editor-title">
          <div>
            <h2>Способ расчёта доставки</h2>
            <p>
              Выберите тариф по районам или по расстоянию от ближайшего филиала.
            </p>
          </div>
        </div>
        <Controller
          name="distancePricingEnabled"
          control={settingsControl}
          render={({ field }) => (
            <fieldset className="delivery-pricing-modes">
              <legend>Как считать стоимость</legend>
              <label className="delivery-map-pricing-toggle">
                <input
                  type="radio"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  data-testid="delivery-area-pricing-enabled"
                  checked={!field.value}
                  onChange={() => field.onChange(false)}
                />
                <span>
                  <strong>По улицам и районам</strong>
                  <small>Цена из справочника или тарифной зоны на карте.</small>
                </span>
              </label>
              <label className="delivery-map-pricing-toggle">
                <input
                  type="radio"
                  name={field.name}
                  onBlur={field.onBlur}
                  data-testid="delivery-distance-pricing-enabled"
                  checked={field.value}
                  onChange={() => field.onChange(true)}
                />
                <span>
                  <strong>По километрам</strong>
                  <small>
                    Расстояние по прямой от ближайшего филиала. Минимум 15 TMT;
                    16 → 15, 17 → 20.
                  </small>
                </span>
              </label>
            </fieldset>
          )}
        />
        <div className="form-grid delivery-price-grid">
          <label>
            <span>Дневная цена за 1 км, TMT</span>
            <input
              data-testid="delivery-day-price-per-km"
              {...registerSettings("dayPricePerKilometer")}
              inputMode="decimal"
              aria-invalid={Boolean(settingsErrors.dayPricePerKilometer)}
            />
            <FormFieldError
              message={settingsErrors.dayPricePerKilometer?.message}
            />
          </label>
          <label>
            <span>Ночная цена за 1 км, TMT</span>
            <input
              data-testid="delivery-night-price-per-km"
              {...registerSettings("nightPricePerKilometer")}
              inputMode="decimal"
              aria-invalid={Boolean(settingsErrors.nightPricePerKilometer)}
            />
            <FormFieldError
              message={settingsErrors.nightPricePerKilometer?.message}
            />
          </label>
        </div>
        <DistancePriceTiers
          control={settingsControl}
          register={registerSettings}
          errors={settingsErrors}
          pending={actions.updateSettings.isPending}
          onEdit={(index) =>
            focusSettings(`distancePriceTiers.${index}.afterKilometers`, { shouldSelect: true })
          }
        />
        <div className="delivery-settings-actions" data-testid="delivery-settings-actions">
          <p role="status" data-testid="delivery-settings-draft-status">
            {settingsDirty ? "Есть несохранённые изменения" : "Тарифы сохранены"}
          </p>
          <div className="delivery-tier-actions">
            <button
              type="submit"
              className="primary-button delivery-settings-save"
              data-testid="delivery-settings-save"
              disabled={actions.updateSettings.isPending || !config.data}
            >
              {actions.updateSettings.isPending ? "Сохраняем…" : "Сохранить тарифы"}
            </button>
            <button
              type="button"
              className="secondary-button"
              data-testid="delivery-settings-cancel"
              disabled={!settingsDirty || actions.updateSettings.isPending || !config.data}
              onClick={() => {
                if (config.data) loadSettings(config.data);
                actions.updateSettings.reset();
              }}
            >
              Отменить изменения
            </button>
          </div>
        </div>
        <h3>Настройки расчёта по улицам и районам</h3>
        {distancePricing && (
          <p
            className="delivery-pricing-hint"
            data-testid="delivery-area-pricing-inactive"
          >
            Выбран расчёт по километрам. Настройки районов и резервного тарифа
            сохранены, но сейчас не влияют на цену.
          </p>
        )}
        <fieldset className="delivery-area-settings" disabled={distancePricing}>
          <label className="delivery-map-pricing-toggle">
            <input
              data-testid="delivery-map-pricing-enabled"
              {...registerSettings("mapPricingEnabled")}
              type="checkbox"
            />
            <span>
              <strong>Находить район по координатам на карте</strong>
              <small>
                Включено — тариф по контуру на карте, вне контуров — резервный.
                Выключено — тариф выбранной улицы из справочника. Названия улиц
                сохраняются в обоих случаях.
              </small>
            </span>
          </label>
          <p>Резервный тариф: если подходящий район не найден.</p>
          <div className="form-grid delivery-price-grid">
            <label>
              <span>Дневная цена, TMT</span>
              <input
                data-testid="delivery-fallback-price"
                {...registerSettings("fallbackPrice")}
                aria-invalid={Boolean(settingsErrors.fallbackPrice)}
                inputMode="decimal"
              />
              <FormFieldError message={settingsErrors.fallbackPrice?.message} />
            </label>
            <label>
              <span>Днём бесплатно от, TMT</span>
              <input
                data-testid="delivery-fallback-threshold"
                {...registerSettings("fallbackFreeDeliveryThreshold")}
                aria-invalid={Boolean(
                  settingsErrors.fallbackFreeDeliveryThreshold,
                )}
                inputMode="decimal"
                placeholder="Пусто — всегда платно"
              />
              <FormFieldError
                message={settingsErrors.fallbackFreeDeliveryThreshold?.message}
              />
            </label>

            <label>
              <span>Ночная цена, TMT</span>
              <input
                data-testid="delivery-fallback-night-price"
                {...registerSettings("fallbackNightPrice")}
                inputMode="decimal"
                aria-invalid={Boolean(settingsErrors.fallbackNightPrice)}
              />
              <FormFieldError
                message={settingsErrors.fallbackNightPrice?.message}
              />
            </label>
            <label>
              <span>Ночью бесплатно от, TMT</span>
              <input
                data-testid="delivery-fallback-night-threshold"
                {...registerSettings("fallbackNightFreeDeliveryThreshold")}
                inputMode="decimal"
                placeholder="Пусто — ночью всегда платно"
                aria-invalid={Boolean(
                  settingsErrors.fallbackNightFreeDeliveryThreshold,
                )}
              />
              <FormFieldError
                message={
                  settingsErrors.fallbackNightFreeDeliveryThreshold?.message
                }
              />
            </label>
          </div>
        </fieldset>
        <button
          className="primary-button delivery-settings-save"
          data-testid="delivery-area-settings-save"
          disabled={actions.updateSettings.isPending || !config.data}
        >
          {actions.updateSettings.isPending ? "Сохраняем…" : "Сохранить настройки"}
        </button>
      </form>

      <NightDeliverySchedule
        config={config.data}
        onReload={() => void config.refetch()}
      />

      <article className="table-card" data-testid="delivery-etrap-table-card">
        <div className="card-title delivery-table-title">
          <div>
            <h2>Улицы и районы — тарифы доставки</h2>
            <span>
              {visibleEtraps.length} из {allEtraps.length}
            </span>
          </div>
          <div className="delivery-filters">
            <input
              aria-label="Поиск улицы или района"
              data-testid="delivery-etrap-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти улицу или район"
            />
          </div>
        </div>
        <AsyncPanel
          pending={config.isPending}
          error={config.error}
          onRetry={() => void config.refetch()}
        >
          <DataTable
            columns={etrapColumns}
            data={visibleEtraps}
            empty="Улицы и районы не найдены."
            getRowId={(etrap) => String(etrap.id)}
            label="Тарифы доставки по улицам и районам"
            minWidth={760}
            pageSize={25}
          />
        </AsyncPanel>
      </article>

      <article
        className="table-card delivery-zone-overview"
        data-testid="delivery-zone-overview"
      >
        <div className="card-title delivery-zone-overview-title">
          <div>
            <h2>Тарифные зоны на карте</h2>
            <small>
              На карте показаны только ваши тарифные зоны. Выберите район на
              карте или откройте сохранённый контур, чтобы назначить цену.
            </small>
          </div>
          <div className="delivery-zone-overview-actions">
            <button
              className={
                mapZoneSelectionMode
                  ? "primary-button compact"
                  : "secondary-button compact"
              }
              data-testid="delivery-map-zone-select"
              disabled={actions.suggestZone.isPending}
              onClick={() => {
                zoneLookupSequence.current += 1;
                setMapZoneSelectionMode((active) => !active);
                setMapZoneSelectionMessage("");
                actions.suggestZone.reset();
              }}
              type="button"
            >
              {actions.suggestZone.isPending
                ? "Ищем границу…"
                : mapZoneSelectionMode
                  ? "Отменить выбор"
                  : "Выбрать район на карте"}
            </button>
            <span
              className={`state-pill ${
                config.data?.mapPricingEnabled ? "is-on" : "is-off"
              }`}
              data-testid="delivery-map-pricing-state"
            >
              {config.data?.mapPricingEnabled
                ? "Расчёт по карте включён"
                : "Подготовка зон"}
            </span>
          </div>
        </div>
        <AsyncPanel
          pending={config.isPending}
          error={config.error}
          onRetry={() => void config.refetch()}
        >
          <Suspense
            fallback={
              <div
                className="empty-state"
                data-testid="delivery-zone-map-loading"
              >
                Загружаем карту тарифов…
              </div>
            }
          >
            {mapZoneSelectionMode && (
              <div
                className="delivery-zone-assistant is-active"
                data-testid="delivery-map-zone-select-hint"
                role="status"
              >
                Нажмите внутри района или города. Если у карты есть готовая
                граница, мы загрузим её; иначе создадим удобный черновик контура
                вокруг выбранной точки.
              </div>
            )}
            {mapZoneSelectionMessage && (
              <div
                className="delivery-zone-assistant"
                data-testid="delivery-map-zone-select-result"
                role="status"
              >
                {mapZoneSelectionMessage}
              </div>
            )}
            <DeliveryZoneMap
              discoveryMode={mapZoneSelectionMode}
              fitRevision={tariffZones.length}
              onDiscover={(point) => void selectTariffZoneFromMap(point)}
              onSelect={(zone) => {
                setMapZoneSelectionMode(false);
                setMapZoneSelectionMessage("");
                openEtrapEditor(zone);
              }}
              zones={tariffZones}
            />
          </Suspense>
          <div
            className="delivery-zone-summary"
            data-testid="delivery-zone-summary"
          >
            <span>Тарифных районов на карте: {tariffZones.length}</span>
            <span>Клик по контуру открывает его цену и настройки</span>
          </div>
        </AsyncPanel>
      </article>

      {welayatEditor && (
        <div
          className="modal-backdrop"
          data-testid="delivery-welayat-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setWelayatEditor(null);
          }}
        >
          <section
            aria-labelledby="delivery-welayat-form-title"
            aria-modal="true"
            className="modal delivery-directory-modal"
            role="dialog"
          >
            <form
              data-testid="delivery-welayat-form"
              noValidate
              onSubmit={handleWelayatSubmit(saveWelayat)}
              ref={welayatFormRef}
            >
              <header className="modal-head">
                <div>
                  <h2 id="delivery-welayat-form-title">
                    {welayatEditor.mode === "create"
                      ? "Новый велаят"
                      : `Велаят: ${welayatEditor.welayat.nameRu}`}
                  </h2>
                </div>
                <button
                  aria-label="Закрыть"
                  className="modal-close"
                  data-testid="delivery-welayat-form-close"
                  type="button"
                  onClick={() => setWelayatEditor(null)}
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
              <div className="form-grid delivery-directory-grid">
                <label>
                  <span>Название на русском</span>
                  <input
                    data-testid="delivery-welayat-name-ru"
                    {...registerWelayat("nameRu")}
                    aria-invalid={Boolean(welayatErrors.nameRu)}
                  />
                  <FormFieldError message={welayatErrors.nameRu?.message} />
                </label>
                <label>
                  <span>Название на туркменском</span>
                  <input
                    data-testid="delivery-welayat-name-tk"
                    {...registerWelayat("nameTk")}
                    aria-invalid={Boolean(welayatErrors.nameTk)}
                  />
                  <FormFieldError message={welayatErrors.nameTk?.message} />
                </label>
              </div>
              <details
                className="delivery-advanced-fields"
                open={welayatAdvancedError || undefined}
              >
                <summary>Дополнительно</summary>
                <div className="form-grid delivery-directory-grid">
                  <label>
                    <span>Название на английском</span>
                    <input
                      data-testid="delivery-welayat-name-en"
                      {...registerWelayat("nameEn")}
                      aria-invalid={Boolean(welayatErrors.nameEn)}
                      placeholder="Необязательно"
                    />
                    <FormFieldError message={welayatErrors.nameEn?.message} />
                  </label>
                  <label className="delivery-sort-field">
                    <span>Порядок отображения</span>
                    <input
                      data-testid="delivery-welayat-sort-order"
                      {...registerWelayat("sortOrder")}
                      aria-invalid={Boolean(welayatErrors.sortOrder)}
                      inputMode="numeric"
                    />
                    <FormFieldError
                      message={welayatErrors.sortOrder?.message}
                    />
                  </label>
                </div>
              </details>
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setWelayatEditor(null)}
                >
                  Отмена
                </button>
                <button
                  className="primary-button"
                  data-testid="delivery-welayat-save"
                  disabled={directoryPending}
                >
                  {directoryPending ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {etrapEditor && (
        <div
          className="modal-backdrop"
          data-testid="delivery-etrap-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEtrapEditor(null);
          }}
        >
          <section
            aria-labelledby="delivery-etrap-form-title"
            aria-modal="true"
            className="modal delivery-directory-modal delivery-zone-modal"
            role="dialog"
          >
            <form
              data-testid="delivery-etrap-form"
              noValidate
              onSubmit={handleEtrapSubmit(saveEtrap)}
              ref={etrapFormRef}
            >
              <header className="modal-head">
                <div>
                  <h2 id="delivery-etrap-form-title">
                    {etrapEditor.mode === "create"
                      ? "Новый тарифный район"
                      : etrapEditor.etrap.nameRu}
                  </h2>
                </div>
                <button
                  aria-label="Закрыть"
                  className="modal-close"
                  data-testid="delivery-etrap-form-close"
                  type="button"
                  onClick={() => setEtrapEditor(null)}
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
              <div className="form-grid delivery-directory-grid">
                <label>
                  <span>Название зоны на русском</span>
                  <input
                    data-testid="delivery-etrap-name-ru"
                    {...registerEtrap("nameRu")}
                    aria-invalid={Boolean(etrapErrors.nameRu)}
                  />
                  <FormFieldError message={etrapErrors.nameRu?.message} />
                </label>
                <label>
                  <span>Название зоны на туркменском</span>
                  <input
                    data-testid="delivery-etrap-name-tk"
                    {...registerEtrap("nameTk")}
                    aria-invalid={Boolean(etrapErrors.nameTk)}
                  />
                  <FormFieldError message={etrapErrors.nameTk?.message} />
                </label>
                <label>
                  <span>Дневная цена, TMT</span>
                  <input
                    data-testid="delivery-etrap-price"
                    {...registerEtrap("price")}
                    aria-invalid={Boolean(etrapErrors.price)}
                    inputMode="decimal"
                  />
                  <FormFieldError message={etrapErrors.price?.message} />
                </label>
                <label>
                  <span>Днём бесплатно от, TMT</span>
                  <input
                    data-testid="delivery-etrap-threshold"
                    {...registerEtrap("freeDeliveryThreshold")}
                    aria-invalid={Boolean(etrapErrors.freeDeliveryThreshold)}
                    inputMode="decimal"
                    placeholder="Пусто — всегда платно"
                  />
                  <FormFieldError
                    message={etrapErrors.freeDeliveryThreshold?.message}
                  />
                </label>

                <label>
                  <span>Ночная цена, TMT</span>
                  <input
                    data-testid="delivery-etrap-night-price"
                    {...registerEtrap("nightPrice")}
                    inputMode="decimal"
                    aria-invalid={Boolean(etrapErrors.nightPrice)}
                  />
                  <FormFieldError message={etrapErrors.nightPrice?.message} />
                </label>
                <label>
                  <span>Ночью бесплатно от, TMT</span>
                  <input
                    data-testid="delivery-etrap-night-threshold"
                    {...registerEtrap("nightFreeDeliveryThreshold")}
                    inputMode="decimal"
                    placeholder="Пусто — ночью всегда платно"
                    aria-invalid={Boolean(
                      etrapErrors.nightFreeDeliveryThreshold,
                    )}
                  />
                  <FormFieldError
                    message={etrapErrors.nightFreeDeliveryThreshold?.message}
                  />
                </label>
                <label className="check-field">
                  <input
                    data-testid="delivery-etrap-enabled"
                    {...registerEtrap("isDeliveryEnabled")}
                    type="checkbox"
                  />
                  Зона доступна клиентам
                </label>
              </div>
              <section
                className="delivery-zone-editor"
                data-testid="delivery-zone-editor"
              >
                <div className="delivery-zone-editor-copy">
                  <div>
                    <h3>Граница тарифа</h3>
                    <p>
                      Цена применяется только внутри сплошного контура. Можно
                      выбрать другой район одним кликом или поправить точки
                      границы вручную.
                    </p>
                  </div>
                  <div className="delivery-zone-editor-actions">
                    {zoneDraft.length >= 3 && (
                      <span className="state-pill is-on">Зона готова</span>
                    )}
                    <button
                      className={
                        zoneDiscoveryMode
                          ? "primary-button compact"
                          : "secondary-button compact"
                      }
                      data-testid="delivery-zone-discover"
                      disabled={actions.suggestZone.isPending}
                      onClick={() => {
                        setZoneDiscoveryMode((active) => !active);
                        setZoneAssistantMessage("");
                      }}
                      type="button"
                    >
                      {actions.suggestZone.isPending
                        ? "Ищем зону…"
                        : zoneDiscoveryMode
                          ? "Отменить выбор"
                          : "Определить зону по карте"}
                    </button>
                  </div>
                </div>
                {zoneDiscoveryMode && (
                  <div
                    className="delivery-zone-assistant is-active"
                    data-testid="delivery-zone-discovery-hint"
                    role="status"
                  >
                    Кликните внутри района или города. Карта загрузит готовую
                    границу либо создаст редактируемый черновик вокруг точки.
                  </div>
                )}
                {zoneAssistantMessage && (
                  <div
                    className="delivery-zone-assistant"
                    data-testid="delivery-zone-discovery-result"
                    role="status"
                  >
                    {zoneAssistantMessage}
                  </div>
                )}
                <Suspense
                  fallback={
                    <div
                      className="empty-state"
                      data-testid="delivery-zone-editor-loading"
                    >
                      Загружаем редактор карты…
                    </div>
                  }
                >
                  <DeliveryZoneMap
                    draft={zoneDraft}
                    discoveryMode={zoneDiscoveryMode}
                    editable
                    fitRevision={zoneFitRevision}
                    onDiscover={(point) => void discoverZone(point)}
                    onDraftChange={(points) => {
                      setZoneDraft(points);
                      setZoneError("");
                    }}
                    selectedId={
                      etrapEditor.mode === "edit" ? etrapEditor.etrap.id : null
                    }
                    zones={allEtraps.filter(
                      ({ id }) =>
                        etrapEditor.mode !== "edit" ||
                        id !== etrapEditor.etrap.id,
                    )}
                  />
                </Suspense>
                {zoneError && (
                  <p
                    className="field-error"
                    data-testid="delivery-zone-error"
                    role="alert"
                  >
                    {zoneError}
                  </p>
                )}
              </section>
              <details
                className="delivery-advanced-fields"
                open={etrapAdvancedError || undefined}
              >
                <summary>Дополнительно</summary>
                <div className="form-grid delivery-directory-grid">
                  <label>
                    <span>Служебная привязка к велаяту</span>
                    <select
                      data-testid="delivery-etrap-welayat"
                      {...registerEtrap("welayatId")}
                      aria-invalid={Boolean(etrapErrors.welayatId)}
                    >
                      <option value="">Выберите велаят</option>
                      {config.data?.welayats.map((welayat) => (
                        <option key={welayat.id} value={welayat.id}>
                          {welayat.nameRu}
                        </option>
                      ))}
                    </select>
                    <FormFieldError message={etrapErrors.welayatId?.message} />
                  </label>
                  <label>
                    <span>Название на английском</span>
                    <input
                      data-testid="delivery-etrap-name-en"
                      {...registerEtrap("nameEn")}
                      aria-invalid={Boolean(etrapErrors.nameEn)}
                      placeholder="Необязательно"
                    />
                    <FormFieldError message={etrapErrors.nameEn?.message} />
                  </label>
                  <label>
                    <span>Порядок внутри велаята</span>
                    <input
                      data-testid="delivery-etrap-queue-position"
                      {...registerEtrap("queuePosition")}
                      aria-invalid={Boolean(etrapErrors.queuePosition)}
                      inputMode="numeric"
                      placeholder="Автоматически по названию"
                    />
                    <FormFieldError
                      message={etrapErrors.queuePosition?.message}
                    />
                  </label>
                </div>
              </details>
              <p className="delivery-directory-note">
                Зону нельзя удалить — выключите её, чтобы скрыть от клиентов и
                сохранить старые адреса и чеки.
              </p>
              {(actions.updateEtrap.error || actions.createEtrap.error) && (
                <div className="inline-alert" role="alert">
                  {
                    (actions.updateEtrap.error || actions.createEtrap.error)
                      ?.message
                  }
                  <button
                    type="button"
                    className="text-button"
                    data-testid="delivery-etrap-reload"
                    onClick={() => {
                      setEtrapEditor(null);
                      actions.updateEtrap.reset();
                      actions.createEtrap.reset();
                      void config.refetch();
                    }}
                  >
                    Обновить список районов
                  </button>
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEtrapEditor(null)}
                >
                  Отмена
                </button>
                <button
                  className="primary-button"
                  data-testid="delivery-etrap-save"
                  disabled={directoryPending || actions.suggestZone.isPending}
                >
                  {directoryPending ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <details className="delivery-setup" data-testid="delivery-setup">
        <summary>
          <span>
            Справочник велаятов
            <small>Служебная привязка районов и создание новых записей</small>
          </span>
          <b>{config.data?.welayats.length ?? 0}</b>
        </summary>

        <div className="delivery-setup-body">
          <article
            className="table-card"
            data-testid="delivery-welayat-table-card"
          >
            <div className="card-title delivery-table-title">
              <div>
                <h2>Служебная привязка к велаятам</h2>
              </div>
              <div className="row-actions">
                <button
                  className="secondary-button compact"
                  data-testid="delivery-etrap-create-manual"
                  type="button"
                  disabled={!config.data?.welayats.length}
                  onClick={openCreateEtrap}
                >
                  Нарисовать зону вручную
                </button>
                <button
                  className="text-button compact"
                  data-testid="delivery-welayat-create"
                  type="button"
                  onClick={openCreateWelayat}
                >
                  Добавить велаят
                </button>
              </div>
            </div>
            <AsyncPanel
              pending={config.isPending}
              error={config.error}
              onRetry={() => void config.refetch()}
            >
              <DataTable
                columns={welayatColumns}
                data={config.data?.welayats ?? []}
                empty="Добавьте первый велаят, затем создайте его районы."
                getRowId={(welayat) => String(welayat.id)}
                label="Справочник велаятов доставки"
                minWidth={420}
              />
            </AsyncPanel>
          </article>
        </div>
      </details>
    </section>
  );
}
