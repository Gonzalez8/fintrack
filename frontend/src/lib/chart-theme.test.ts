import { describe, expect, it } from "vitest";
import { niceTicks } from "./chart-theme";

describe("niceTicks", () => {
  it("starts at 0 and rounds the top up", () => {
    expect(niceTicks(4, 33.3)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(0, 34000)).toEqual([0, 10000, 20000, 30000, 40000]);
  });

  it("covers negative values with the same step", () => {
    expect(niceTicks(-3.6, 38)).toEqual([-20, 0, 20, 40]);
    expect(niceTicks(-1200, 300)).toEqual([-1500, -1000, -500, 0, 500]);
  });

  it("handles small and empty ranges", () => {
    expect(niceTicks(0.1, 0.9)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(0, 0)).toEqual([0]);
  });
});
