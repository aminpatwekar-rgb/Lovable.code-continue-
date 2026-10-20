import { describe, it, expect } from "vitest";
import { isModuleLoadError } from "./module-load-error";

describe("page module recovery", () => {
  it("recognizes the reported Settings download failure", () => {
    expect(isModuleLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/settings-BDOEfhkr.js"))).toBe(true);
  });
  it("does not reload for ordinary application errors", () => {
    expect(isModuleLoadError(new Error("Could not load plan information."))).toBe(false);
  });
});