// XS: the Ingredient choices can load after the sheet is mounted. The sheet then starts on "Something else" (nothing to
// pick); once the choices arrive the starting choice becomes Ingredient, unless the User already chose a mode.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { shopStrings } from "../strings";
import { ExtraSheet } from "./ExtraSheet";

const ingredients = [{ id: 1, name: "milk", baseUnit: "ml" }];
const element = (list: typeof ingredients) => (
  <ExtraSheet open onClose={() => {}} ingredients={list} onSubmit={() => {}} />
);
const radio = (name: string) => screen.getByRole("radio", { name });

describe("ExtraSheet: Ingredient choices that load late", () => {
  it("starts on Something else with no choices, then switches to Ingredient when they arrive", () => {
    const { rerender } = render(element([]));
    expect(radio("Something else")).toHaveAttribute("aria-checked", "true");
    rerender(element(ingredients));
    expect(radio("Ingredient")).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("combobox", { name: /Ingredient/ }),
    ).toBeInTheDocument();
  });

  it("keeps the User's mode when they already picked one before the choices arrive", async () => {
    const { rerender } = render(element([]));
    await userEvent.click(radio("Something else"));
    rerender(element(ingredients));
    expect(radio("Something else")).toHaveAttribute("aria-checked", "true");
  });
});

describe("ExtraSheet: Cancel wording", () => {
  it("reuses fieldStrings.cancel instead of a duplicate shopStrings.cancel", () => {
    expect("cancel" in shopStrings).toBe(false);
  });
});
