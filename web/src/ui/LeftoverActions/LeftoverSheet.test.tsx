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
    expect(onConfirm).toHaveBeenCalledWith({ kind: "had-it", portions: 1.5 });
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

describe("Freeze it", () => {
  it("lists freezers only, defaults to the default Storage Place when it is a freezer, shows the Use-by note", async () => {
    view("freeze", {
      storagePlaces: places.map((p) => ({ ...p, default: p.id === 2 })),
    });
    expect(
      screen.getByRole("dialog", { name: "Freeze Chilli" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Storage Place" }),
    ).toHaveTextContent("Garage Freezer");
    expect(
      screen.getByText("Use by 10 Feb in the freezer (90 days)"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Storage Place" }),
    );
    expect(
      (await screen.findAllByRole("option")).map((o) => o.textContent),
    ).toEqual(["Basement Freezer", "Garage Freezer"]);
  });
  it("uses the Recipe Frozen Use-by in the note when it has one", () => {
    view("freeze", { recipeFrozenUseBy: 30 });
    expect(
      screen.getByText("Use by 12 Dec in the freezer (30 days)"),
    ).toBeInTheDocument();
  });
  it("defaults to the portions no Planned Meal is planned to use and confirms Storage Place and portions", async () => {
    const { onConfirm } = view("freeze", {
      leftover: leftover({ portions: 5, plannedPortions: 2 }),
    });
    expect(portions().textContent).toBe("3");
    await pickOption("Storage Place", "Garage Freezer");
    await userEvent.click(screen.getByRole("button", { name: "Freeze it" }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: "freeze",
      storagePlaceId: 2,
      portions: 3,
    });
  });
  it("names the Planned Meals the server dry run says lose portions, and asks again when the draft changes", async () => {
    const api = dryRuns({
      "POST /api/plan/leftovers/1/freeze?dryRun=1": (c: {
        body?: { portions?: number };
      }) => ({ replanned: (c.body?.portions ?? 0) >= 3 ? [friLunch] : [] }),
    });
    view("freeze", { leftover: leftover({ portions: 4, plannedPortions: 2 }) });
    expect(portions().textContent).toBe("2");
    await waitFor(() =>
      expect(
        api.callsTo("POST", "/api/plan/leftovers/1/freeze?dryRun=1"),
      ).toHaveLength(1),
    );
    expect(api.calls[0]!.body).toEqual({ storagePlaceId: 4, portions: 2 });
    expect(screen.queryByText(/is planned again/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /increase portions/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /increase portions/i }),
    );
    expect(
      await screen.findByText(
        "Fri Lunch was going to have it; it is planned again.",
      ),
    ).toBeInTheDocument();
    expect(api.calls.at(-1)!.body).toEqual({ storagePlaceId: 4, portions: 3 });
  });
  it("lists every Planned Meal from the dry run, even two on the same day and slot, without key warnings", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    dryRuns({
      "POST /api/plan/leftovers/1/freeze?dryRun=1": {
        replanned: [friLunch, { ...friLunch, courseId: 2 }, friDinner],
      },
    });
    view("freeze");
    await waitFor(() =>
      expect(screen.getAllByText(/is planned again/)).toHaveLength(3),
    );
    expect(error.mock.calls.flat().join(" ")).not.toMatch(/unique "key"/);
  });
  it("with no freezer it says to add one and links to Storage Places instead of confirming", () => {
    view("freeze", {
      storagePlaces: places.filter((p) => p.kind !== "freezer"),
      storagePlacesHref: "/settings/storage-places",
    });
    expect(screen.getByText("Add a Freezer first")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Storage Places" }),
    ).toHaveAttribute("href", "/settings/storage-places");
    expect(screen.queryByRole("button", { name: "Freeze it" })).toBeNull();
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
