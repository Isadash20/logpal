import { describe, expect, it } from "vitest";
import { servingChoice } from "./servingLabel";

describe("servingChoice", () => {
  it("names the first portion the serving and leaves the rest alone", () => {
    expect(servingChoice({ label: "30 g", grams: 30, multiplier: 1 }, 0)).toBe(
      "1 serving · 30 g"
    );
    expect(
      servingChoice({ label: "1 cup", grams: 240, multiplier: 1 }, 0)
    ).toBe("1 serving · 1 cup");
    expect(servingChoice({ label: "1 serving", multiplier: 1 }, 0)).toBe(
      "1 serving"
    );
    expect(
      servingChoice({ label: "100 g", grams: 100, multiplier: 3 }, 1)
    ).toBe("100 g");
  });
});
