import { z } from "zod";

const versionPattern = /^\d+\.\d+\.\d+$/;
const version = z
  .string()
  .trim()
  .max(32, "Не больше 32 символов")
  .regex(versionPattern, "Укажите версию в формате 1.4.0, без номера сборки");

export function compareVersions(left: string, right: string) {
  const a = left.split(".").map(BigInt);
  const b = right.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0n) > (b[i] ?? 0n)) return 1;
    if ((a[i] ?? 0n) < (b[i] ?? 0n)) return -1;
  }
  return 0;
}

export const appVersionFormSchema = z
  .object({
    platform: z.enum(["ANDROID", "IOS"]),
    latestVersion: version,
    minSupportedVersion: version,
    storeUrl: z.string().trim().url("Укажите ссылку на магазин").max(2048),
    releaseNotesRu: z.string().trim().max(5000, "Не больше 5000 символов"),
    releaseNotesTk: z.string().trim().max(5000, "Не больше 5000 символов"),
    publishedConfirmed: z
      .boolean()
      .refine(
        (value) => value,
        "Подтвердите, что версия доступна всем пользователям в магазине",
      ),
  })
  .superRefine((values, ctx) => {
    if (
      versionPattern.test(values.latestVersion) &&
      versionPattern.test(values.minSupportedVersion) &&
      compareVersions(values.minSupportedVersion, values.latestVersion) > 0
    )
      ctx.addIssue({
        code: "custom",
        path: ["minSupportedVersion"],
        message: "Минимальная версия не может быть выше последней",
      });
    try {
      const url = new URL(values.storeUrl);
      const allowed =
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        (values.platform === "ANDROID"
          ? url.hostname === "play.google.com" &&
            url.pathname === "/store/apps/details" &&
            url.searchParams.get("id") === "com.gurbanov.alowalow"
          : url.hostname === "apps.apple.com" &&
            /\/id[1-9]\d*$/.test(url.pathname));
      if (!allowed) throw new Error("store");
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["storeUrl"],
        message:
          values.platform === "ANDROID"
            ? "Нужна HTTPS-ссылка Play Store для com.gurbanov.alowalow"
            : "Нужна HTTPS-ссылка apps.apple.com с настоящим числовым App Store ID",
      });
    }
  });

export type AppVersionFormValues = z.infer<typeof appVersionFormSchema>;
export const versionTestId = (platform: "ANDROID" | "IOS", name: string) =>
  `app-version-${platform.toLowerCase()}-${name}`;
