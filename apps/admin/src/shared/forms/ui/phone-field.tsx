import type { ChangeEvent, ReactNode } from "react";

export const PHONE_PREFIX = "+993";

export function formatLocalPhoneNumber(digits: string) {
  return (digits.match(/.{1,2}/g) ?? []).join(" ");
}

export function digitsFromPhone(phone: string) {
  const raw = phone.startsWith(PHONE_PREFIX)
    ? phone.slice(PHONE_PREFIX.length)
    : phone;
  return raw.replace(/\D/g, "").slice(0, 8);
}

export function localDigitsFromInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function PhoneNumberInput({
  value,
  onChange,
  onBlur,
  testId,
  readOnly,
  placeholder = "65 12 34 56",
  icon,
}: {
  value: string;
  onChange: (digits: string) => void;
  onBlur?: () => void;
  testId?: string;
  readOnly?: boolean;
  placeholder?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="phone-input">
      <span className="phone-input-prefix">
        {icon}
        {PHONE_PREFIX}
      </span>
      <input
        data-testid={testId}
        value={formatLocalPhoneNumber(value)}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(localDigitsFromInput(event.target.value))
        }
        onBlur={onBlur}
        type="tel"
        inputMode="numeric"
        placeholder={placeholder}
        autoComplete="tel"
        readOnly={readOnly}
      />
    </div>
  );
}
