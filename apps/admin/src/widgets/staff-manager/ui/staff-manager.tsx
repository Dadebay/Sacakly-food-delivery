import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit02Icon, PowerIcon } from "@hugeicons/core-free-icons";
import { roleLabels, type Role } from "@/src/entities/order";
import { useMyAdminPageAccess } from "@/src/entities/admin-page-access";
import { useRecentLogins, useStaff, type Staff } from "@/src/entities/staff";
import { useStaffActions } from "@/src/features/staff-management";
import { useSession } from "@/src/shared/auth";
import {
  digitsFromPhone,
  FormFieldError,
  PHONE_PREFIX,
  PhoneNumberInput,
} from "@/src/shared/forms";
import { AsyncPanel, DataTable } from "@/src/shared/ui";
import {
  staffFormSchema,
  staffRoles,
  type StaffFormInput,
  type StaffFormValues,
} from "../model/staff-form";

const ALL_ROLES_TAB = "ALL" as const;

export function StaffManager() {
  const { session } = useSession();
  const pageAccess = useMyAdminPageAccess();
  const staff = useStaff();
  const recentLogins = useRecentLogins();
  const actions = useStaffActions();
  const [editing, setEditing] = useState<Staff | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [staffRoleFilter, setStaffRoleFilter] = useState<
    Role | typeof ALL_ROLES_TAB
  >(ALL_ROLES_TAB);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<StaffFormInput, unknown, StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    mode: "onBlur",
    defaultValues: {
      phone: "",
      firstName: "",
      lastName: "",
      role: "OPERATOR",
      isActive: true,
    },
  });
  const canEdit = Boolean(
    session &&
      (["ADMIN", "SUPER_ADMIN"].includes(session.user.role) ||
        pageAccess.data?.allowedPages.includes("STAFF")),
  );

  const formRef = useRef<HTMLFormElement>(null);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    setPhoneDigits("");
    reset();
  }, [reset]);

  // Modal acilinca ilk alan odaklansin; kullanici fareye uzanmasin.
  useEffect(() => {
    if (!showForm) return;
    formRef.current?.querySelector<HTMLElement>("input, select")?.focus();
  }, [showForm]);

  // Esc her modalda beklenen davranis; bu dialogda eksikti.
  useEffect(() => {
    if (!showForm) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeForm();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showForm, closeForm]);

  function handlePhoneChange(digits: string) {
    setPhoneDigits(digits);
    setValue("phone", digits ? `${PHONE_PREFIX}${digits}` : "", {
      shouldDirty: true,
    });
  }

  const staffRoleTabs = useMemo(() => {
    const present = new Set((staff.data ?? []).map((member) => member.role));
    return (Object.keys(roleLabels) as Role[]).filter((role) =>
      present.has(role),
    );
  }, [staff.data]);

  const filteredStaff = useMemo(() => {
    if (staffRoleFilter === ALL_ROLES_TAB) return staff.data ?? [];
    return (staff.data ?? []).filter(
      (member) => member.role === staffRoleFilter,
    );
  }, [staff.data, staffRoleFilter]);

  const lastLoginById = useMemo(
    () => new Map((recentLogins.data ?? []).map((user) => [user.id, user.lastLoginAt])),
    [recentLogins.data],
  );

  const columns = useMemo<ColumnDef<Staff, unknown>[]>(
    () => [
      {
        header: "Сотрудник",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>
              {[row.original.firstName, row.original.lastName]
                .filter(Boolean)
                .join(" ") || "Без имени"}
            </strong>
            <a href={`tel:${row.original.phone}`}>{row.original.phone}</a>
          </div>
        ),
      },
      {
        header: "Роль",
        cell: ({ row }) => (
          <span className={`role-badge role-badge-${row.original.role.toLowerCase()}`}>
            {roleLabels[row.original.role]}
          </span>
        ),
      },
      {
        header: "Работа",
        cell: ({ row }) => (
          <span className="muted">
            доставок {row.original._count.courierOrders} · кухня{" "}
            {row.original._count.cookedOrders}
          </span>
        ),
      },
      {
        header: "Последний вход",
        cell: ({ row }) => {
          const lastLoginAt = lastLoginById.get(row.original.id);
          return (
            <span className="muted">
              {lastLoginAt ? new Date(lastLoginAt).toLocaleString("ru-RU") : "Не входил"}
            </span>
          );
        },
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Активен" : "Отключён"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          canEdit && (
            <div className="row-actions">
              <button
                aria-label="Изменить"
                title="Изменить"
                className="secondary-button compact row-icon-button"
                onClick={() => {
                  setEditing(row.original);
                  setPhoneDigits(digitsFromPhone(row.original.phone));
                  reset({
                    phone: row.original.phone,
                    firstName: row.original.firstName ?? "",
                    lastName: row.original.lastName ?? "",
                    role:
                      staffRoles.find((role) => role === row.original.role) ??
                      "OPERATOR",
                    isActive: row.original.isActive,
                  });
                  setShowForm(true);
                }}
              >
                <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.8} />
              </button>
              <button
                aria-label={row.original.isActive ? "Отключить" : "Включить"}
                title={row.original.isActive ? "Отключить" : "Включить"}
                className="text-button row-icon-button"
                disabled={actions.updateStaff.isPending}
                onClick={() =>
                  actions.updateStaff.mutate({
                    id: row.original.id,
                    body: {
                      role: row.original.role,
                      isActive: !row.original.isActive,
                    },
                  })
                }
              >
                <HugeiconsIcon icon={PowerIcon} size={15} strokeWidth={1.8} />
              </button>
            </div>
          ),
      },
    ],
    [actions.updateStaff, canEdit, lastLoginById, reset],
  );

  async function submit(values: StaffFormValues) {
    if (editing) {
      await actions.updateStaff.mutateAsync({
        id: editing.id,
        body: {
          role: values.role,
          firstName: values.firstName,
          lastName: values.lastName,
          isActive: values.isActive,
        },
      });
    } else {
      await actions.createStaff.mutateAsync({
        phone: values.phone,
        role: values.role,
        firstName: values.firstName,
        lastName: values.lastName,
      });
    }
    setEditing(null);
    setPhoneDigits("");
    setShowForm(false);
  }

  const mutationError = actions.createStaff.error || actions.updateStaff.error;

  return (
    <section className="admin-section" data-testid="staff-manager">
      <header className="section-head" data-testid="staff-header">
        <div>
          <h1>Команда</h1>
          <p>
            Операторы, повара, курьеры и бухгалтеры. Изменения пишутся в аудит.
          </p>
        </div>
        {canEdit && (
          <div
            className="header-actions section-header-actions"
            data-testid="staff-header-actions"
          >
            <button
              className="primary-button"
              data-testid="staff-form-open"
              onClick={() => {
                setEditing(null);
                setPhoneDigits("");
                reset();
                setShowForm(true);
              }}
            >
              + Сотрудник
            </button>
          </div>
        )}
      </header>

      {mutationError && (
        <div className="inline-alert">
          {mutationError instanceof Error ? mutationError.message : ""}
        </div>
      )}

      {showForm && (
        <div
          className="modal-backdrop"
          data-testid="staff-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            aria-labelledby="staff-form-title"
            aria-modal="true"
            className="modal staff-form-modal"
            role="dialog"
          >
            <form
              data-testid="staff-form"
              noValidate
              onSubmit={handleSubmit(submit)}
              ref={formRef}
            >
              <header className="modal-head">
                <div>
                  <h2 id="staff-form-title">
                    {editing ? "Изменить сотрудника" : "Новый сотрудник"}
                  </h2>
                  <p>
                    {editing
                      ? "Обновите роль и данные сотрудника."
                      : "Добавьте сотрудника и назначьте ему роль."}
                  </p>
                </div>
                <button
                  aria-label="Закрыть"
                  className="modal-close"
                  type="button"
                  data-testid="staff-form-close"
                  onClick={closeForm}
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
              <div className="form-grid">
                {!editing && (
                  <label className="wide-field">
                    <span>Телефон</span>
                    <PhoneNumberInput
                      testId="staff-phone"
                      value={phoneDigits}
                      onChange={handlePhoneChange}
                      onBlur={() => void trigger("phone")}
                    />
                    <FormFieldError message={errors.phone?.message} />
                  </label>
                )}
                <label>
                  <span>Имя</span>
                  <input
                    data-testid="staff-first-name"
                    {...register("firstName")}
                    aria-invalid={Boolean(errors.firstName)}
                    autoComplete="given-name"
                    placeholder="Мерет"
                  />
                  <FormFieldError message={errors.firstName?.message} />
                </label>
                <label>
                  <span>Фамилия</span>
                  <input
                    data-testid="staff-last-name"
                    {...register("lastName")}
                    aria-invalid={Boolean(errors.lastName)}
                    autoComplete="family-name"
                    placeholder="Аманов"
                  />
                  <FormFieldError message={errors.lastName?.message} />
                </label>
                <label className="wide-field">
                  <span>Роль</span>
                  <select
                    data-testid="staff-role"
                    {...register("role")}
                    aria-invalid={Boolean(errors.role)}
                  >
                    {staffRoles
                      .filter(
                        (role) =>
                          role !== "SUPER_ADMIN" ||
                          session?.user.role === "SUPER_ADMIN",
                      )
                      .map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[role]}
                        </option>
                      ))}
                  </select>
                  <FormFieldError message={errors.role?.message} />
                </label>
                {editing && (
                  <label className="check-field">
                    <input
                      data-testid="staff-active"
                      {...register("isActive")}
                      type="checkbox"
                    />
                    Активен
                  </label>
                )}
              </div>
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeForm}
                >
                  Отмена
                </button>
                <button
                  className="primary-button"
                  data-testid="staff-save"
                  disabled={
                    actions.createStaff.isPending || actions.updateStaff.isPending
                  }
                >
                  Сохранить сотрудника
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <article className="table-card" data-testid="staff-table-card">
        <div className="card-title">
          <h2>Все сотрудники</h2>
          <span>{filteredStaff.length}</span>
        </div>
        <div className="view-tabs role-tabbar" role="tablist" aria-label="Фильтр по роли">
          <button
            type="button"
            role="tab"
            aria-selected={staffRoleFilter === ALL_ROLES_TAB}
            className={staffRoleFilter === ALL_ROLES_TAB ? "active" : ""}
            onClick={() => setStaffRoleFilter(ALL_ROLES_TAB)}
          >
            Все
            <span className="role-tab-count">{staff.data?.length ?? 0}</span>
          </button>
          {staffRoleTabs.map((role) => (
            <button
              key={role}
              type="button"
              role="tab"
              aria-selected={staffRoleFilter === role}
              className={staffRoleFilter === role ? "active" : ""}
              onClick={() => setStaffRoleFilter(role)}
            >
              {roleLabels[role]}
              <span className="role-tab-count">
                {(staff.data ?? []).filter((member) => member.role === role)
                  .length}
              </span>
            </button>
          ))}
        </div>
        <AsyncPanel
          pending={staff.isPending}
          error={staff.error}
          onRetry={() => void staff.refetch()}
        >
          <DataTable
            columns={columns}
            data={filteredStaff}
            getRowId={(member) => member.id}
            empty="Сотрудников пока нет"
            label="Команда A7-tagam"
          />
        </AsyncPanel>
      </article>
    </section>
  );
}
