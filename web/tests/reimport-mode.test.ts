import { describe, expect, it } from "vitest";

import {
  parseReimportMode,
  reimportModeFromMapping,
} from "../lib/import/reimport-mode";

describe("re-import mode", () => {
  it("defaults new submissions to append", () => {
    expect(parseReimportMode(undefined)).toBe("append");
    expect(parseReimportMode("unexpected")).toBe("append");
  });

  it("keeps legacy jobs in update mode", () => {
    expect(reimportModeFromMapping(null)).toBe("update");
    expect(reimportModeFromMapping({ decisions: [] })).toBe("update");
  });

  it("reads explicit append and update modes", () => {
    expect(reimportModeFromMapping({ mode: "append" })).toBe("append");
    expect(reimportModeFromMapping({ mode: "update" })).toBe("update");
  });
});
