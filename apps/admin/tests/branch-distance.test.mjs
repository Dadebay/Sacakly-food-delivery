import assert from "node:assert/strict";
import test from "node:test";
import { formatBranchDistance } from "../src/entities/branch/model/branch-distance.ts";

test("formats the persisted branch distance for the order board", () => {
  assert.equal(formatBranchDistance(null), null);
  assert.equal(formatBranchDistance(438), "438 м");
  assert.equal(formatBranchDistance(1_425), "1.4 км");
  assert.equal(formatBranchDistance(12_400), "12 км");
});
