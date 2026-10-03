import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../src/app/styles/globals.css", import.meta.url);

const cream = [254, 247, 231];
const navy = [6, 47, 94];

function mix(foreground, background, foregroundRatio) {
  return foreground.map((channel, index) =>
    Math.round(
      channel * foregroundRatio + background[index] * (1 - foregroundRatio),
    ),
  );
}

function luminance(rgb) {
  const channels = rgb
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return (
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  );
}

function contrast(first, second) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);

  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

test("shared admin controls use a distinct surface and border", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /--field-surface:\s*color-mix\(/);
  assert.match(styles, /--field-border:\s*color-mix\(/);
  assert.match(styles, /--field-placeholder:\s*color-mix\(/);
  assert.match(styles, /--field-focus-ring:\s*color-mix\(/);
  assert.match(
    styles,
    /\.toolbar input,[\s\S]*?\.otp-card input\s*\{[^}]*border: 1px solid var\(--field-border\);[^}]*background: var\(--field-surface\);/,
  );
  assert.match(
    styles,
    /\.modal input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),[\s\S]*?\.modal textarea\s*\{[^}]*border: 1px solid var\(--field-border\);[^}]*background: var\(--field-surface\);/,
  );
});

test("search, role and file controls expose visible interaction states", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.role-switch\s*\{[^}]*border: 1px solid var\(--field-border\);[^}]*background: var\(--field-surface\);/,
  );
  assert.match(
    styles,
    /\.search-box:focus-within\s*\{[^}]*border-color: var\(--brand-orange\);[^}]*box-shadow: 0 0 0 3px var\(--field-focus-ring\);/,
  );
  assert.match(
    styles,
    /\.catalog-search-input\s*\{[^}]*border: 1px solid var\(--field-border\);[^}]*background: var\(--field-surface\);/,
  );
  assert.match(
    styles,
    /\.form-grid input\[type="file"\]::file-selector-button,[\s\S]*?border: 1px solid var\(--brand-orange\);/,
  );
});

test("disabled controls remain readable and visually unavailable", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /--field-surface-disabled:\s*color-mix\(/);
  assert.match(
    styles,
    /\.toolbar :is\(input, select\):disabled,[\s\S]*?\.otp-card input:read-only\s*\{[^}]*background: var\(--field-surface-disabled\);[^}]*cursor: not-allowed;/,
  );
});

test("shared field colors keep text and boundaries readable", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  const fieldSurface = mix(cream, navy, 0.88);
  const fieldBorder = mix(navy, cream, 0.6);
  const fieldPlaceholder = mix(navy, cream, 0.75);

  assert.match(
    styles,
    /--field-border:\s*color-mix\(\s*in srgb,\s*var\(--brand-navy\) 60%,/,
  );
  assert.match(
    styles,
    /--field-placeholder:\s*color-mix\(\s*in srgb,\s*var\(--brand-navy\) 75%,/,
  );
  assert.ok(contrast(navy, fieldSurface) >= 4.5);
  assert.ok(contrast(fieldPlaceholder, fieldSurface) >= 4.5);
  assert.ok(contrast(fieldBorder, fieldSurface) >= 3);
  assert.ok(contrast(fieldBorder, cream) >= 3);
});

test("courier assignment select follows shared control states", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.order-kanban-courier select\s*\{[^}]*border: 1px solid var\(--field-border\);[^}]*background: var\(--field-surface\);/,
  );
  assert.match(
    styles,
    /\.order-kanban-courier select:focus\s*\{[^}]*border-color: var\(--brand-orange\);[^}]*box-shadow:\s*0 0 0 3px var\(--field-focus-ring\),/,
  );
});

test("catalog and assisted order overrides preserve shared contrast", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.catalog-editor-modal \.form-grid input::placeholder,[\s\S]*?color: var\(--field-placeholder\);/,
  );
  assert.match(
    styles,
    /\.catalog-editor-modal \.form-grid input:not\(\[type="checkbox"\]\):hover,[\s\S]*?border-color: var\(--field-border-hover\);/,
  );
  assert.match(
    styles,
    /\.assisted-order-modal input,[\s\S]*?border-color: var\(--field-border\);[^}]*background: var\(--field-surface\);/,
  );
  assert.match(
    styles,
    /\.assisted-order-modal input::placeholder,[\s\S]*?color: var\(--field-placeholder\);/,
  );
});

test("modal checkbox remains a compact native control", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(
    styles,
    /\.modal input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),/,
  );
  assert.match(
    styles,
    /\.form-grid \.check-field input\s*\{[^}]*width: 18px;[^}]*height: 18px;[^}]*accent-color: var\(--brand-orange\);/,
  );
});
