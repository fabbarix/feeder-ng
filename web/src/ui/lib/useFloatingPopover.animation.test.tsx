// XS: a popover opened while the sheet is still sliding in is measured against the moving dialog. When the dialog's
// animation ends, useFloatingPopover must place it again so it ends up where the trigger finally is.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "../BottomSheet";
import { Select } from "../Select/Select";

const rect = (top: number, left: number, width: number, height: number) =>
  ({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

let triggerTop = 100;
beforeEach(() => {
  Object.assign(HTMLElement.prototype, {
    showPopover: vi.fn(),
    hidePopover: vi.fn(),
  });
  vi.stubGlobal("innerHeight", 768);
  vi.stubGlobal("innerWidth", 1024);
  triggerTop = 100;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if (this.classList.contains("select__trigger"))
        return rect(triggerTop, 200, 320, 48);
      if (this.classList.contains("select__popover"))
        return rect(0, 0, 360, 200);
      return rect(0, 0, 0, 0);
    },
  );
});
afterEach(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>)
    .showPopover;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>)
    .hidePopover;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const options = [{ value: "a", label: "Apple" }];
const popover = () => document.querySelector<HTMLElement>(".select__popover")!;

describe("useFloatingPopover re-places on the dialog animationend", () => {
  it("moves the popover to the trigger's final position when the sheet animation ends", async () => {
    render(
      <BottomSheet open onClose={() => {}} title="Sheet">
        <Select
          label="Fruit"
          options={options}
          value={null}
          onChange={() => {}}
        />
      </BottomSheet>,
    );
    await userEvent.click(screen.getByRole("combobox", { name: /Fruit/ }));
    expect(popover().style.top).toBe("152px"); // trigger bottom 148 + 4, measured mid-animation
    triggerTop = 300; // the sheet has finished sliding
    act(() => {
      document
        .querySelector("dialog")!
        .dispatchEvent(new Event("animationend", { bubbles: true }));
    });
    expect(popover().style.top).toBe("352px");
  });

  it("stops listening once the popover is closed", async () => {
    render(
      <BottomSheet open onClose={() => {}} title="Sheet">
        <Select
          label="Fruit"
          options={options}
          value={null}
          onChange={() => {}}
        />
      </BottomSheet>,
    );
    const dialog = document.querySelector("dialog")!;
    const remove = vi.spyOn(dialog, "removeEventListener");
    await userEvent.click(screen.getByRole("combobox", { name: /Fruit/ }));
    await userEvent.keyboard("{Escape}");
    expect(remove).toHaveBeenCalledWith("animationend", expect.any(Function));
  });
});
