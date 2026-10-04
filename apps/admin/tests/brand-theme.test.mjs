import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import test from "node:test";

const palette = new Set(["#062f5e", "#ec7a1b", "#fef7e7"]);

test("admin branding uses the A7-tagam logo and exact supplied palette", async () => {
  const [html, styles, brand, dashboard, courier, logo] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(
      new URL("../src/app/styles/globals.css", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/shared/ui/brand-logo.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/admin-dashboard/ui/admin-dashboard.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/widgets/courier-tracking/ui/courier-tracking-screen.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    stat(new URL("../public/a7-tagam-logo.webp", import.meta.url)),
  ]);

  assert.match(html, /A7-tagam — центр управления доставкой/);
  assert.match(html, /a7-tagam-logo\.png/);
  assert.match(brand, /src="\/a7-tagam-logo\.webp"/);
  assert.match(dashboard, /<BrandLogo/);
  assert.match(courier, /<BrandLogo/);
  assert.doesNotMatch(`${html}${dashboard}${courier}`, /Saçakly|ÖÝDE|OYDE/i);
  assert.ok(logo.size > 1_000);

  const literals = styles.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
  assert.deepEqual(new Set(literals.map((value) => value.toLowerCase())), palette);
});
