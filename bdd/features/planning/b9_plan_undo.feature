Feature: What changed, and Undo of a Swap, of Cooked, of Not cooked and of Regenerate
  Every write that can replan says which other meals it changed and gives an undo token. One restore puts the plan back
  while nothing else has written since. Cooked and Not cooked can be taken back until the end of the household day
  (beta.9, PC-01, SAFE-03, SAFE-07). The visual halves (toast, Review sheet, Planned Meal sheet, Regenerate confirm) are
  covered by the web tests of the plan UI package.

  Background: Monday 2026-11-09 12:00 UTC. Monday's dinner is chicken (Yield 4, two eat), Tuesday is served from its two extra portions
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 3 days ahead
    And the planning Recipes:
      | name    | yield | tags | needs                            |
      | pasta   | 2     |      | 100 g flour                      |
      | soup    | 2     |      | 120 g carrot                     |
      | curry   | 2     |      | 150 g rice                       |
      | chicken | 4     |      | 400 g chicken thighs, 250 g rice |
    And I am signed in as the User
    And the planner has finished
    And I pin the plan slot on 2026-11-09 as "chicken"
    And the planner has finished

  # --- PC-01: What changed ---

  Scenario: Swapping a meal tells me which other meals changed
    When I pin the plan slot on 2026-11-09 as "pasta"
    Then the response status is 200
    And the answer has an undo token
    And the answer lists the meal of 2026-11-10 as changed from "chicken"
    And the answer does not list the meal of 2026-11-09 as changed

  Scenario: Meals that still fit stay where they are after a Swap
    Given I remember the Recipe planned on 2026-11-11
    When I pin the plan slot on 2026-11-09 as "pasta"
    Then the plan slot on 2026-11-11 has the remembered Recipe

  Scenario: Undo after a Swap puts every changed meal back
    Given I remember the plan
    When I pin the plan slot on 2026-11-09 as "pasta"
    And I undo the change
    Then the response status is 200
    And the plan is as I remembered it

  Scenario: Undo after another edit says nothing was undone
    When I pin the plan slot on 2026-11-09 as "pasta"
    And I remember the undo token
    And I pin the plan slot on 2026-11-09 as "soup"
    And I undo the change with the remembered undo token
    Then the response status is 409
    And the error code is "plan_changed"
    And the plan slot on 2026-11-09 has the Recipe "soup"

  Scenario: A second User's Swap shows me what changed
    Given I am signed in as the Admin
    And a live-update stream is open
    And I am signed in as the User
    When I pin the plan slot on 2026-11-09 as "pasta"
    Then the live-update stream receives a plan event by "User" listing 1 changed meal

  # --- SAFE-07: Regenerate can be undone ---

  Scenario: Regenerate can be undone straight after
    Given I remember the plan
    When I regenerate the plan
    Then the answer has an undo token
    When I undo the change
    Then the response status is 200
    And the plan is as I remembered it

  # --- SAFE-03: Undo of Cooked and Not cooked ---

  Scenario: Not cooked from To confirm can be undone from the toast
    Given the household clock is 2026-11-09 21:30 UTC
    And the planner has finished
    When I list the meals to confirm
    Then the plan JSON "slots" has 1 items
    When I mark the slot on 2026-11-09 as Not cooked
    And I list the meals to confirm
    Then the plan has no meals to confirm
    When I reopen the slot on 2026-11-09
    Then the response status is 200
    When I list the meals to confirm
    Then the plan JSON "slots" has 1 items

  Scenario: A wrong Cooked can be undone the same day from its sheet
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    When I mark the slot on 2026-11-09 as Cooked
    Then the plan slot on 2026-11-09 says it can be undone
    When I reopen the slot on 2026-11-09
    Then the response status is 200
    And the plan slot on 2026-11-09 is planned
    And the plan slot on 2026-11-10 is served from the Leftover of 2026-11-09

  Scenario: Undo Cooked gives the Stock back
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    When I mark the slot on 2026-11-09 as Cooked
    Then planning Stock holds 600 g of "chicken thighs" in total
    When I reopen the slot on 2026-11-09
    Then planning Stock holds 1000 g of "chicken thighs" in total
    And planning Stock holds 1000 g of "rice" in total

  Scenario: Undo Cooked is refused once the Leftover was had
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    When I mark the slot on 2026-11-09 as Cooked
    And I have 1 portion of the Leftover cooked on 2026-11-09
    Then the plan slot on 2026-11-09 says it cannot be undone because "leftover_used"
    When I reopen the slot on 2026-11-09
    Then the response status is 409
    And the error code is "leftover_used"
    And the plan slot on 2026-11-09 is cooked
    And planning Stock holds 600 g of "chicken thighs" in total

  Scenario: Undo is refused the day after
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    When I mark the slot on 2026-11-09 as Cooked
    And the household clock is 2026-11-10 08:00 UTC
    Then the plan slot on 2026-11-09 says it cannot be undone because "window_over"
    When I reopen the slot on 2026-11-09
    Then the response status is 409
    And the error code is "reopen_window_over"

  Scenario: Cooked after all from a Not cooked meal
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    When I mark the slot on 2026-11-09 as Not cooked
    And I reopen the slot on 2026-11-09
    And I mark the slot on 2026-11-09 as Cooked
    Then the response status is 200
    And the plan slot on 2026-11-09 is cooked
    And planning Stock holds 600 g of "chicken thighs" in total
