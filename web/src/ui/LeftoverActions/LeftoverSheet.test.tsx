import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockApi,
  newQueryClient,
  pickOption,
} from "../../features/settings/test-utils";
import {
  friDinner,
  friLunch,
  frozenChilli,
  leftover,
  places,
  TODAY,
} from "../../lib/leftovers/fixtures";
import type { LeftoverActionKind } from "../../lib/leftovers";
import { LeftoverSheet, type LeftoverSheetProps } from "./LeftoverSheet";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  dryRuns();
});

// The server dry run: no Planned Meal loses portions unless a test says so.
const quiet = { replanned: [] };
const dryRuns = (over: Record<string, unknown> = {}) =>
  mockApi({
    "POST /api/plan/leftovers/1/had-it?dryRun=1": quiet,
    "POST /api/plan/leftovers/1/threw-out?dryRun=1": quiet,
    "POST /api/plan/leftovers/1/freeze?dryRun=1": quiet,
    ...over,
  } as Parameters<typeof mockApi>[0]);

const view = (
  action: LeftoverActionKind | null,
  over: Partial<LeftoverSheetProps> = {},
  routed = false,
) => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const sheet = (
    <QueryClientProvider client={newQueryClient()}>
      <LeftoverSheet
        action={action}
        leftover={leftover({ portions: 3 })}
        today={TODAY}
        storagePlaces={places}
        recipeFrozenUseBy={null}
        householdFrozenUseBy={90}
        recipeUseByDays={3}
        onConfirm={onConfirm}
        onClose={onClose}
        {...over}
      />
    </QueryClientProvider>
  );
  render(
    routed ? (
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={sheet} />
          <Route
            path="/settings/storage-places"
            element={<p>Storage Places page</p>}
          />
        </Routes>
      </MemoryRouter>
    ) : (
      sheet
    ),
  );
  return { onConfirm, onClose };
};
const portions = () => screen.getByRole("spinbutton", { name: /portions/i });

describe("closed", () => {
  it("renders nothing without an action", () => {
    view(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Had it", () => {
  it("asks how many portions, one by default, and confirms them", async () => {
    const { onConfirm } = view("had-it");
    expect(
      screen.getByRole("dialog", {
        name: "How many portions of Chilli did you have?",
      }),
    ).toBeInTheDocument();
    expect(portions().textContent).toBe("1");
    await userEvent.click(
      screen.getByRole("button", { name: /increase portions/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Had it" }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: "had-it", portions: 1.25 });
  });
  it("the stepper stops at what is left", () => {
    view("had-it", { leftover: leftover({ portions: 0.5 }) });
    expect(portions().textContent).toBe("0.5");
    expect(
      screen.getByRole("button", { name: /increase portions/i }),
    ).toBeDisabled();
  });
  it("Cancel closes without confirming", async () => {
    const { onConfirm, onClose } = view("had-it");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("confirm is disabled while busy", () => {
    view("had-it", { busy: true });
    expect(screen.getByRole("button", { name: "Had it" })).toBeDisabled();
  });
});

describe("Threw it out", () => {
  it("names the waste, defaults to all the portions and confirms with the danger button", async () => {
    const { onConfirm } = view("threw-out");
    expect(
      screen.getByRole("dialog", { name: "Throw out Chilli?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This counts as waste: the zero-waste streak starts again today.",
      ),
    ).toBeInTheDocument();
    expect(portions().textContent).toBe("3");
    const button = screen.getByRole("button", { name: "Threw it out" });
    expect(button).toHaveAttribute("data-variant", "danger");
    await userEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith({ kind: "threw-out", portions: 3 });
  });
});

describe("Freeze it (PC-13: one question)", () => {
  const withDefault = places.map((p) => ({ ...p, default: p.id === 2 }));
  const group = () => screen.getByRole("group", { name: "Portions to freeze" });
  const value = () => within(group()).getByRole("spinbutton");
  const press = (name: RegExp) => userEvent.click(within(group()).getByRole("button", { name }));

  it("is titled with the one question, and the context line names the Recipe and what is left", () => {
    view("freeze");
    const dialog = screen.getByRole("dialog", { name: /How many portions to freeze\?/ });
    expect(within(dialog).getByRole("heading", { name: "How many portions to freeze?" })).toBeInTheDocument();
    expect(dialog.querySelector(".sheet__context")).toHaveTextContent("Chilli · 3 left");
  });
  it("has one decision: a large Stepper named 'Portions to freeze', from 0.25 to what is left, described by the hint", () => {
    view("freeze", { leftover: leftover({ portions: 1.25 }) });
    expect(group()).toHaveAttribute("data-size", "lg");
    expect(value()).toHaveAttribute("aria-valuemin", "0.25");
    expect(value()).toHaveAttribute("aria-valuemax", "1.25");
    const hint = document.getElementById(value().getAttribute("aria-describedby")!);
    expect(hint).toHaveTextContent("All of it. None of it is planned.");
  });
  it("offers every portion of a 1.25 Leftover and its quarter steps reach it", async () => {
    view("freeze", { leftover: leftover({ portions: 1.25 }) });
    expect(value()).toHaveAttribute("aria-valuenow", "1.25");
    await press(/^Decrease/);
    expect(value()).toHaveAttribute("aria-valuenow", "1");
    await press(/^Increase/);
    expect(value()).toHaveAttribute("aria-valuenow", "1.25");
    expect(within(group()).getByRole("button", { name: /^Increase/ })).toBeDisabled();
  });
  it("defaults to every spare portion and says where the others are planned", () => {
    view("freeze", { leftover: leftover({ portions: 2.5, plannedPortions: 1.25 }), plannedFor: ["Mon Dinner"] });
    expect(value()).toHaveAttribute("aria-valuenow", "1.25");
    expect(document.getElementById(value().getAttribute("aria-describedby")!)).toHaveTextContent("1.25 of 2.5. The rest is planned for Mon Dinner.");
  });
  it("names where it goes on one line: 'Goes to Garage Freezer · Use by 10 Feb'", () => {
    view("freeze", { storagePlaces: withDefault });
    expect(screen.getByText(/Goes to/)).toHaveTextContent("Goes to Garage Freezer · Use by 10 Feb");
  });
  it("the Use-by follows the Recipe's Frozen Use-by", () => {
    view("freeze", { recipeFrozenUseBy: 30 });
    expect(screen.getByText(/Goes to/)).toHaveTextContent("Use by 12 Dec");
  });
  it("Change opens the Storage Place choice with freezers only, and the choice is kept", async () => {
    const { onConfirm } = view("freeze", { storagePlaces: withDefault });
    await userEvent.click(screen.getByRole("button", { name: "Change Storage Place" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Basement Freezer", "Garage Freezer"]);
    await userEvent.click(screen.getByRole("option", { name: "Basement Freezer" }));
    expect(screen.getByText(/Goes to/)).toHaveTextContent("Goes to Basement Freezer");
    await userEvent.click(screen.getByRole("button", { name: /^Freeze 3 portions$/ }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: "freeze", storagePlaceId: 4, portions: 3 });
  });
  it("has Cancel (secondary) and one primary whose label follows the stepper, with a snowflake", async () => {
    const { onConfirm, onClose } = view("freeze", { storagePlaces: withDefault });
    const primary = screen.getByRole("button", { name: "Freeze 3 portions" });
    expect(primary).toHaveAttribute("data-variant", "primary");
    expect(primary.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("data-variant", "secondary");
    await press(/^Decrease/);
    expect(screen.getByRole("button", { name: "Freeze 2.75 portions" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Freeze 2.75 portions" }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: "freeze", storagePlaceId: 2, portions: 2.75 });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
  it("says 'Freeze 1 portion' for one", async () => {
    view("freeze", { leftover: leftover({ portions: 1 }) });
    expect(screen.getByRole("button", { name: "Freeze 1 portion" })).toBeInTheDocument();
  });
  it("has no Close button (the sheet has Cancel, R-B), exactly one primary and no select on show", () => {
    view("freeze");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    expect(within(dialog).getAllByRole("button").filter((b) => b.getAttribute("data-variant") === "primary")).toHaveLength(1);
    expect(within(dialog).queryByRole("combobox")).toBeNull();
  });
  it("names the Planned Meals the server dry run says lose portions, and asks again when the draft changes", async () => {
    const api = dryRuns({
      "POST /api/plan/leftovers/1/freeze?dryRun=1": (c: { body?: { portions?: number } }) => ({ replanned: (c.body?.portions ?? 0) >= 2.5 ? [friLunch] : [] }),
    });
    view("freeze", { leftover: leftover({ portions: 4, plannedPortions: 2 }) });
    expect(value()).toHaveAttribute("aria-valuenow", "2");
    await waitFor(() => expect(api.callsTo("POST", "/api/plan/leftovers/1/freeze?dryRun=1")).toHaveLength(1));
    expect(api.calls[0]!.body).toEqual({ storagePlaceId: 4, portions: 2 });
    expect(screen.queryByText(/is planned again/)).toBeNull();
    await press(/^Increase/);
    await press(/^Increase/);
    expect(await screen.findByText("Fri Lunch was going to have it; it is planned again.")).toBeInTheDocument();
    expect(api.calls.at(-1)!.body).toEqual({ storagePlaceId: 4, portions: 2.5 });
  });
  it("lists every Planned Meal from the dry run, even two on the same day and slot, without key warnings", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    dryRuns({ "POST /api/plan/leftovers/1/freeze?dryRun=1": { replanned: [friLunch, { ...friLunch, courseId: 2 }, friDinner] } });
    view("freeze");
    await waitFor(() => expect(screen.getAllByText(/is planned again/)).toHaveLength(3));
    expect(error.mock.calls.flat().join(" ")).not.toMatch(/unique "key"/);
  });
  it("with no freezer it says to add one and links to Storage Places instead of confirming", () => {
    view("freeze", { storagePlaces: places.filter((p) => p.kind !== "freezer"), storagePlacesHref: "/settings/storage-places" });
    expect(screen.getByText("Add a Freezer first")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Storage Places" })).toHaveAttribute("href", "/settings/storage-places");
    expect(screen.queryByRole("button", { name: /^Freeze \d/ })).toBeNull();
  });
});

describe("Storage Places link (no Freezer)", () => {
  const noFreezer = {
    storagePlaces: places.filter((p) => p.kind !== "freezer"),
    storagePlacesHref: "/settings/storage-places",
  };
  it("navigates inside the router without a page reload", async () => {
    view("freeze", noFreezer, true);
    const click = vi.fn((e: Event) => e.defaultPrevented);
    const link = screen.getByRole("link", { name: "Storage Places" });
    link.addEventListener("click", (e) => {
      setTimeout(() => click(e), 0);
    });
    await userEvent.click(link);
    expect(await screen.findByText("Storage Places page")).toBeInTheDocument();
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(click.mock.results[0]!.value).toBe(true);
  });
  it("is a plain link when there is no router", () => {
    view("freeze", noFreezer);
    expect(
      screen.getByRole("link", { name: "Storage Places" }),
    ).toHaveAttribute("href", "/settings/storage-places");
  });
});

describe("dry run on Had it and Threw it out", () => {
  it("Had it names the Planned Meals that would lose portions, from the server, with no plan data passed in", async () => {
    const api = dryRuns({
      "POST /api/plan/leftovers/1/had-it?dryRun=1": { replanned: [friDinner] },
    });
    view("had-it");
    expect(
      await screen.findByText(
        "Fri Dinner was going to have it; it is planned again.",
      ),
    ).toBeInTheDocument();
    expect(api.calls[0]!.body).toEqual({ portions: 1 });
  });
  it("Threw it out asks with the all-portions default", async () => {
    const api = dryRuns({
      "POST /api/plan/leftovers/1/threw-out?dryRun=1": {
        replanned: [friLunch],
      },
    });
    view("threw-out");
    expect(
      await screen.findByText(
        "Fri Lunch was going to have it; it is planned again.",
      ),
    ).toBeInTheDocument();
    expect(api.calls[0]!.body).toEqual({ portions: 3 });
  });
  it("Take out asks the dry run too and names the Planned Meals it replans", async () => {
    const api = dryRuns({
      "POST /api/plan/leftovers/5/take-out?dryRun=1": { replanned: [friLunch] },
    });
    view("take-out", { leftover: frozenChilli() });
    expect(
      await screen.findByText(
        "Fri Lunch was going to have it; it is planned again.",
      ),
    ).toBeInTheDocument();
    expect(api.calls[0]!.body).toEqual({ storagePlaceId: 1 });
  });
});

describe("Take out", () => {
  const frozen = frozenChilli();
  it("offers non-freezer places and Not sorted, and shows the new Use-by", async () => {
    view("take-out", { leftover: frozen });
    expect(
      screen.getByRole("dialog", { name: "Take Chilli out of the freezer?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Use by Sun once out (3 days)"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Storage Place" }),
    );
    const names = (await screen.findAllByRole("option")).map(
      (o) => o.textContent ?? "",
    );
    for (const want of ["Garage Fridge", "Kitchen Pantry", "Not sorted"])
      expect(names.some((n) => n.includes(want))).toBe(true);
    expect(names.join("|")).not.toMatch(/Freezer/);
  });
  it("confirms the chosen Storage Place", async () => {
    const { onConfirm } = view("take-out", { leftover: frozen });
    await pickOption("Storage Place", /Garage Fridge/);
    await userEvent.click(screen.getByRole("button", { name: "Take out" }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: "take-out",
      storagePlaceId: 3,
    });
  });
  it("defaults to the Household default Storage Place when it is not a freezer", async () => {
    const { onConfirm } = view("take-out", { leftover: frozen });
    expect(
      screen.getByRole("combobox", { name: "Storage Place" }),
    ).toHaveTextContent("Kitchen Pantry");
    await userEvent.click(screen.getByRole("button", { name: "Take out" }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: "take-out",
      storagePlaceId: 1,
    });
  });
  it("defaults to Not sorted when the Household default is a freezer", async () => {
    const { onConfirm } = view("take-out", {
      leftover: frozen,
      storagePlaces: places.map((p) => ({ ...p, default: p.id === 2 })),
    });
    expect(
      screen.getByRole("combobox", { name: "Storage Place" }),
    ).toHaveTextContent("Not sorted");
    await userEvent.click(screen.getByRole("button", { name: "Take out" }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: "take-out",
      storagePlaceId: null,
    });
  });
  it("Not sorted confirms null", async () => {
    const { onConfirm } = view("take-out", { leftover: frozen });
    await pickOption("Storage Place", /Not sorted/);
    await userEvent.click(screen.getByRole("button", { name: "Take out" }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: "take-out",
      storagePlaceId: null,
    });
  });
});

describe("accessibility", () => {
  it("is a modal dialog whose buttons live in its footer", () => {
    view("had-it");
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Had it" }),
    ).toBeInTheDocument();
  });
});
