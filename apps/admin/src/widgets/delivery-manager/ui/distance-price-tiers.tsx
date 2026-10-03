import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { FormFieldError } from "@/src/shared/forms";
import type {
  DeliverySettingsFormInput,
  DeliverySettingsFormValues,
} from "../model/delivery-form";

type Props = {
  control: Control<
    DeliverySettingsFormInput,
    unknown,
    DeliverySettingsFormValues
  >;
  register: UseFormRegister<DeliverySettingsFormInput>;
  errors: FieldErrors<DeliverySettingsFormInput>;
  pending: boolean;
  onEdit: (index: number) => void;
};

export function DistancePriceTiers({
  control,
  register,
  errors,
  pending,
  onEdit,
}: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "distancePriceTiers",
  });
  return (
    <section
      className="delivery-distance-tiers"
      data-testid="delivery-distance-tiers"
      aria-labelledby="delivery-distance-tiers-heading"
    >
      <div>
        <h3 id="delivery-distance-tiers-heading">
          Цена за километр после заданного расстояния
        </h3>
        <p>
          До первого порога действуют цены выше. Каждая следующая цена
          применяется только к километрам после её порога.
        </p>
        <p>
          Например: первые 5 км по 5 TMT, после 5 км — по 4 TMT. Минимум 15 TMT
          и округление применяются один раз к общей стоимости.
        </p>
      </div>
      {fields.length === 0 && (
        <p data-testid="delivery-distance-tiers-empty">
          Ступеней нет: одна цена за километр на всём расстоянии.
        </p>
      )}
      {fields.map((field, index) => (
        <fieldset
          key={field.id}
          className="delivery-distance-tier"
          data-testid={`delivery-distance-tier-${field.id}`}
          disabled={pending}
        >
          <legend>Ступень {index + 1}</legend>
          <div className="form-grid delivery-distance-tier-grid">
            <label>
              <span>После, км</span>
              <input
                {...register(`distancePriceTiers.${index}.afterKilometers`)}
                data-testid="delivery-tier-after-km"
                inputMode="decimal"
                placeholder="5"
                aria-invalid={Boolean(
                  errors.distancePriceTiers?.[index]?.afterKilometers,
                )}
              />
              <FormFieldError
                message={
                  errors.distancePriceTiers?.[index]?.afterKilometers?.message
                }
              />
            </label>
            <label>
              <span>Днём за 1 км, TMT</span>
              <input
                {...register(
                  `distancePriceTiers.${index}.dayPricePerKilometer`,
                )}
                data-testid="delivery-tier-day-price"
                inputMode="decimal"
                placeholder="4"
                aria-invalid={Boolean(
                  errors.distancePriceTiers?.[index]?.dayPricePerKilometer,
                )}
              />
              <FormFieldError
                message={
                  errors.distancePriceTiers?.[index]?.dayPricePerKilometer
                    ?.message
                }
              />
            </label>
            <label>
              <span>Ночью за 1 км, TMT</span>
              <input
                {...register(
                  `distancePriceTiers.${index}.nightPricePerKilometer`,
                )}
                data-testid="delivery-tier-night-price"
                inputMode="decimal"
                placeholder="4"
                aria-invalid={Boolean(
                  errors.distancePriceTiers?.[index]?.nightPricePerKilometer,
                )}
              />
              <FormFieldError
                message={
                  errors.distancePriceTiers?.[index]?.nightPricePerKilometer
                    ?.message
                }
              />
            </label>
          </div>
          <div className="delivery-tier-actions">
            <button
              type="button"
              className="secondary-button compact"
              data-testid="delivery-tier-edit"
              aria-label={`Редактировать ступень ${index + 1}`}
              onClick={() => onEdit(index)}
            >
              Редактировать
            </button>
            <button
              type="button"
              className="secondary-button compact danger-button"
              data-testid="delivery-tier-remove"
              aria-label={`Удалить ступень ${index + 1}`}
              onClick={() => remove(index)}
            >
              Удалить ступень
            </button>
          </div>
        </fieldset>
      ))}
      <FormFieldError
        message={
          errors.distancePriceTiers?.root?.message ??
          errors.distancePriceTiers?.message
        }
      />
      <button
        type="button"
        className="secondary-button"
        data-testid="delivery-tier-add"
        disabled={pending || fields.length >= 20}
        onClick={() =>
          append({
            afterKilometers: "",
            dayPricePerKilometer: "",
            nightPricePerKilometer: "",
          })
        }
      >
        Добавить ступень
      </button>
      <p className="delivery-pricing-hint">
        После редактирования или удаления ступеней нажмите «Сохранить тарифы».
      </p>
    </section>
  );
}
