import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useSession } from "@/src/shared/auth";
import {
  FormFieldError,
  PHONE_PREFIX,
  PhoneNumberInput,
} from "@/src/shared/forms";
import {
  otpRequestSchema,
  otpVerifySchema,
  type OtpLoginFormValues,
} from "../model/otp-login-form";
import { PhoneIcon } from "./otp-login-icons";

export function OtpLoginCard({
  title = "Вход по телефону",
  description = "Получите одноразовый код по SMS.",
}: {
  title?: string;
  description?: string;
}) {
  const { requestOtp, verifyOtp } = useSession();
  const [codeRequested, setCodeRequested] = useState(false);
  const [apiError, setApiError] = useState("");
  const [devCode, setDevCode] = useState("");
  const [localNumber, setLocalNumber] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    trigger,
    setError,
    formState: { errors },
  } = useForm<OtpLoginFormValues>({
    resolver: zodResolver(otpRequestSchema),
    mode: "onBlur",
    defaultValues: { phone: "", code: "" },
  });

  function handleLocalNumberChange(digits: string) {
    setLocalNumber(digits);
    setValue("phone", `${PHONE_PREFIX}${digits}`, { shouldDirty: true });
  }
  const otpRequest = useMutation({ mutationFn: requestOtp });
  const otpVerify = useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) =>
      verifyOtp(phone, code),
  });
  const pending = otpRequest.isPending || otpVerify.isPending;

  async function submit(values: OtpLoginFormValues) {
    setApiError("");
    try {
      if (!codeRequested) {
        const response = await otpRequest.mutateAsync(values.phone);
        setCodeRequested(true);
        setDevCode(response.devCode ?? "");
      } else {
        const verified = otpVerifySchema.safeParse(values);
        if (!verified.success) {
          setError("code", {
            message:
              verified.error.issues[0]?.message ??
              "Введите код подтверждения",
          });
          return;
        }
        await otpVerify.mutateAsync(verified.data);
      }
    } catch (reason) {
      setApiError(
        reason instanceof Error ? reason.message : "Не удалось войти",
      );
    }
  }

  return (
    <form
      className="otp-card"
      data-testid="otp-login-form"
      noValidate
      onSubmit={handleSubmit(submit)}
    >
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <label>
        <span>Номер телефона</span>
        <PhoneNumberInput
          testId="otp-login-phone"
          value={localNumber}
          onChange={handleLocalNumberChange}
          onBlur={() => void trigger("phone")}
          readOnly={codeRequested || pending}
          icon={<PhoneIcon />}
        />
        <FormFieldError message={errors.phone?.message} />
      </label>
      {codeRequested && (
        <label>
          <span>Код подтверждения</span>
          <input
            data-testid="otp-login-code"
            {...register("code", {
              onChange(event) {
                event.target.value = String(event.target.value).replace(
                  /\D/g,
                  "",
                );
              },
            })}
            aria-invalid={Boolean(errors.code)}
            inputMode="numeric"
            maxLength={6}
            placeholder="0000 или 000000"
            autoComplete="one-time-code"
          />
          <FormFieldError message={errors.code?.message} />
        </label>
      )}
      {devCode && (
        <p className="otp-dev-code">
          Локальный SMS-код: <strong>{devCode}</strong>
        </p>
      )}
      {apiError && <p className="form-error">{apiError}</p>}
      <button
        className="primary-button"
        data-testid="otp-login-submit"
        type="submit"
        disabled={pending}
      >
        {pending
          ? "Подождите…"
          : codeRequested
            ? "Подтвердить"
            : "Получить код"}
      </button>
      {codeRequested && (
        <button
          className="text-button"
          data-testid="otp-login-change-phone"
          type="button"
          onClick={() => {
            setCodeRequested(false);
            setDevCode("");
            setApiError("");
            setLocalNumber("");
            reset();
          }}
          disabled={pending}
        >
          Изменить номер
        </button>
      )}
    </form>
  );
}
