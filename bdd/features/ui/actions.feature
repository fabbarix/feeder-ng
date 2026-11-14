# B9-01 / DS-12 (R-A, R-B, R-D, R-D+, R-E): the action primitives, as people see them.
# These are screen behaviours, so the Go suite has no steps for them and they are parked with @wip (registry_test.go runs "~@wip").
# Each scenario is pinned by named tests in web/src/ui and web/src/theme:
#   outline            -> Button.css.test.ts, IconButton.css.test.ts, theme/contrast.test.ts, page-layout rule P29
#   Cancel, no Close   -> BottomSheet.cancel.test.tsx, Dialog.cancel.test.tsx, ConfirmDialog.actions.test.tsx, check-ui sheet-cancel
#   toast icon         -> Toast.test.tsx, Toast.css.test.ts
#   shortfall rows     -> DetailList.ds.test.tsx (the primitive); the Shortfall notice's own tests belong to its theme package
@wip
Feature: Actions look like actions
  Every action has a visible boundary, a sheet offers Cancel or Close but never both, a toast shows an icon only when it adds a
  status, and a list of Ingredients with a state reads as rows.

  Scenario: Every action on a tinted tile has a visible outline
    Given the Today screen shows a Leftover tile and a Spoil tile
    When I look at the actions in those tiles
    Then every action has a fill and a 1 px outline
    And no action is bare text
    And the outline contrasts with what it sits on by at least 3 to 1

  Scenario: A sheet with a Cancel button has no Close button
    Given I open the "Mark as cooked" sheet for a Planned Meal
    Then the footer starts with a Cancel button drawn as an outline button
    And the header has no Close button
    When I press Escape
    Then the sheet closes

  Scenario: A sheet without a Cancel button has a circular Close
    Given I open the "Unknown barcode" sheet
    Then the header has one Close button, a circle that is not squashed
    And the footer has no Cancel button

  Scenario: A success toast has no icon; an error toast shows its icon before its headline
    When I swap a Planned Meal
    Then the toast headline reads "Swapped" with no icon
    When a swap cannot be undone
    Then the toast headline reads "Nothing was undone"
    And a warning icon sits on the headline line, before the words

  Scenario: A toast with detail has a headline, a subline, a body and real buttons
    When I mark a Planned Meal as cooked
    Then the toast shows a headline, a muted subline and a body line
    And it offers an outlined "Undo" button
    And it can be dismissed with a round Dismiss button

  Scenario: The Stock shortfall after Cooked lists each Ingredient as a row with its shortfall at the end
    Given I cook a Recipe that needs 300 g of Flour while the Stock holds 100 g
    When the Stock shortfall notice appears
    Then it lists "Flour" as a row
    And the row shows "200 g short" at its end
    And the row shows "The Recipe used 300 g · Stock showed 100 g" beneath, in muted text
    And the notice contains no bullet sentences
