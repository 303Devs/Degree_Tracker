import { execFileSync } from "child_process";
import fs from "fs";
import { describe, expect, it } from "vitest";

function ignoredPaths(): string[] {
  return fs.readFileSync(".gitignore", "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

describe("runtime data gitignore hygiene", () => {
  it("records Phase 5 edit override runtime state in .gitignore", () => {
    expect(ignoredPaths()).toContain("data/edit-state.json");
  });

  it("git ignores the runtime edit-state file", () => {
    const ignored = execFileSync("git", ["check-ignore", "data/edit-state.json"], { encoding: "utf-8" }).trim();

    expect(ignored).toBe("data/edit-state.json");
  });
});
