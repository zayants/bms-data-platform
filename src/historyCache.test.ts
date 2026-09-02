import { describe, expect, it } from "vitest";
import { mergeCoverage, missingCoverage } from "./historyCache";

describe("history cache coverage", () => {
  it("merges overlapping and adjacent intervals", () => {
    expect(mergeCoverage([{ from: 20, to: 30 }, { from: 1, to: 10 }, { from: 11, to: 19 }])).toEqual([{ from: 1, to: 30 }]);
  });

  it("finds gaps at the beginning, middle and end", () => {
    expect(missingCoverage(0, 100, [{ from: 10, to: 20 }, { from: 40, to: 80 }])).toEqual([
      { from: 0, to: 9 }, { from: 21, to: 39 }, { from: 81, to: 100 },
    ]);
  });

  it("returns no gaps for a fully covered range", () => {
    expect(missingCoverage(10, 20, [{ from: 0, to: 30 }])).toEqual([]);
  });
});
