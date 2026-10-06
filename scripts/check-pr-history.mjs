import { execFileSync } from "node:child_process";

const baseRef = process.env.BASE_REF;
if (!baseRef || !/^[A-Za-z0-9._/-]+$/.test(baseRef)) {
  throw new Error("BASE_REF must name the pull request base branch");
}
const base = execFileSync("git", ["merge-base", "HEAD", `origin/${baseRef}`], {
  encoding: "utf8",
}).trim();
const diff = execFileSync(
  "git",
  ["diff", "--unified=0", base, "HEAD", "--", "docs/CHANGELOG.md"],
  { encoding: "utf8" },
);
if (!/^\+## \d{4}-\d{2}-\d{2} — .+$/m.test(diff)) {
  throw new Error("Every PR must add a dated section to docs/CHANGELOG.md");
}
console.log("PR change-history entry found");
