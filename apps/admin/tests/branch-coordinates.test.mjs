import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeBranchCoordinates } from "../src/widgets/branch-manager/model/branch-coordinates.ts";

test("accepts valid branch coordinates selected on the map", () => {
  assert.deepEqual(normalizeBranchCoordinates(37.9601, 58.3261), {
    latitude: 37.9601,
    longitude: 58.3261,
  });
  assert.deepEqual(normalizeBranchCoordinates(-90, 180), {
    latitude: -90,
    longitude: 180,
  });
});

test("rejects non-finite and out-of-range map coordinates", () => {
  assert.equal(normalizeBranchCoordinates(Number.NaN, 58.3261), null);
  assert.equal(
    normalizeBranchCoordinates(37.9601, Number.POSITIVE_INFINITY),
    null,
  );
  assert.equal(normalizeBranchCoordinates(90.0001, 58.3261), null);
  assert.equal(normalizeBranchCoordinates(37.9601, -180.0001), null);
});

test("keeps map-selected coordinates at the database precision", () => {
  assert.deepEqual(normalizeBranchCoordinates(37.960123456, 58.32610004), {
    latitude: 37.9601235,
    longitude: 58.3261,
  });
});

test("branch form accepts a location only through the map marker", async () => {
  const managerSource = await readFile(
    new URL(
      "../src/widgets/branch-manager/ui/branch-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const pickerSource = await readFile(
    new URL(
      "../src/widgets/branch-manager/ui/branch-location-picker.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(managerSource, /name=["']latitude["']/);
  assert.doesNotMatch(managerSource, /name=["']longitude["']/);
  assert.match(managerSource, /disabled=\{pending \|\| !selectedCoordinates\}/);
  assert.match(pickerSource, /data-testid=["']branch-map-picker["']/);
  assert.doesNotMatch(pickerSource, /Открыть Aýterek/);
});
