import assert from "node:assert/strict";
import test from "node:test";
import { appVersionFormSchema, compareVersions } from "../src/widgets/app-version-manager/model/app-version-form.ts";
import { updateVersionCache } from "../src/entities/app-version/model/update-version-cache.ts";
import { navigationForRole } from "../src/widgets/admin-dashboard/model/admin-navigation.ts";

const form = { platform: "ANDROID", latestVersion: "1.10.0", minSupportedVersion: "1.9.3", storeUrl: "https://play.google.com/store/apps/details?id=com.gurbanov.alowalow", releaseNotesRu: "", releaseNotesTk: "", publishedConfirmed: true };

test("mobile versions compare numeric components, including multi-digit and leading zeros", () => {
  assert.equal(compareVersions("1.10.0", "1.9.3"), 1);
  assert.equal(compareVersions("01.010.00", "1.10.0"), 0);
  assert.equal(compareVersions("1.0.0", "2.0.0"), -1);
  assert.equal(compareVersions("1.0.1", "1.0.0"), 1);
});

test("form accepts published platform policy and rejects minimum above latest", () => {
  assert.equal(appVersionFormSchema.safeParse(form).success, true);
  const result = appVersionFormSchema.safeParse({ ...form, minSupportedVersion: "1.11.0" });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], "minSupportedVersion");
  for (const latestVersion of ["1.0", "1.0.0+37", "1.0.0-beta", "x.0.0", ""]) {
    assert.equal(appVersionFormSchema.safeParse({ ...form, latestVersion }).success, false);
  }
  assert.equal(appVersionFormSchema.safeParse({ ...form, publishedConfirmed: false }).success, false);
});

test("store links must match platform and real URL structure", () => {
  for (const storeUrl of ["http://play.google.com/store/apps/details?id=com.gurbanov.alowalow", "https://example.com", "https://play.google.com/store/apps/details?id=wrong", "https://apps.apple.com/app/id123"]) {
    assert.equal(appVersionFormSchema.safeParse({ ...form, storeUrl }).success, false);
  }
  assert.equal(appVersionFormSchema.safeParse({ ...form, platform: "IOS", storeUrl: "https://apps.apple.com/tm/app/a7/id123456789" }).success, true);
  assert.equal(appVersionFormSchema.safeParse({ ...form, platform: "IOS", storeUrl: "https://apps.apple.com/app/id<APP_STORE_ID>" }).success, false);
});

test("saved policy replaces only its platform cache and preserves the other record", () => {
  const android = { platform: "ANDROID", version: 1 };
  const ios = { platform: "IOS", version: 5 };
  const next = { platform: "ANDROID", version: 2 };
  assert.deepEqual(updateVersionCache([android, ios], next), [next, ios]);
  assert.equal(updateVersionCache([android, ios], next)[1], ios);
  assert.deepEqual(updateVersionCache(undefined, next), [next]);
});

test("settings route allows only administrators", () => {
  for (const role of ["ADMIN", "SUPER_ADMIN"])
    assert.equal(navigationForRole(role).find(({ id }) => id === "app-versions")?.path, "/settings/app-versions");
  for (const role of ["ACCOUNTANT", "COURIER", "CUSTOMER", "OPERATOR", "COOK"])
    assert.equal(navigationForRole(role).some(({ id }) => id === "app-versions"), false);
});
