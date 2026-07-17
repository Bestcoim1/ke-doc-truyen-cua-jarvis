import { describe, expect, it } from "vitest";

import {
  isCancellableStatus,
  MAX_ACTIVE_IMPORT_JOBS,
  staleImportJobIds,
} from "../lib/import/queries";

describe("import draft retention", () => {
  it("keeps only the five newest jobs returned by the ordered query", () => {
    const jobs = Array.from({ length: 8 }, (_, index) => ({
      id: `job-${index + 1}`,
    }));

    expect(MAX_ACTIVE_IMPORT_JOBS).toBe(5);
    expect(staleImportJobIds(jobs)).toEqual(["job-6", "job-7", "job-8"]);
  });

  it("reserves one slot before a new import is created", () => {
    const jobs = Array.from({ length: 5 }, (_, index) => ({ id: `job-${index}` }));
    expect(staleImportJobIds(jobs, MAX_ACTIVE_IMPORT_JOBS - 1)).toEqual([
      "job-4",
    ]);
  });

  it("allows abandoned parsing and failed jobs to be cancelled", () => {
    expect(isCancellableStatus("parsing")).toBe(true);
    expect(isCancellableStatus("failed")).toBe(true);
    expect(isCancellableStatus("completed")).toBe(false);
  });
});
