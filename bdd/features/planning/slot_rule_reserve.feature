Feature: A Slot Rule reserves its Recipe
  The planner keeps the Recipe a Slot Rule names for the rule's slot and does not place it on
  earlier days where its Cool-down would then leave the rule's slot empty (spec §7.2).
  Friday dinner = pizza must work without the User pinning the other days first.

  Five Recipes for five days, each in a 7-day Cool-down: if pizza is cooked on any earlier day,
  Friday has nothing left to plan, so the scenarios fail unless the planner reserves pizza.

  Background: Monday 2026-11-09 12:00 UTC, a five-day Planning Horizon (Mon 9 to Fri 13)
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 5 days ahead
    And the planning Recipes:
      | name  | yield | tags  | needs        |
      | pizza | 2     | Pizza | 200 g dough  |
      | pasta | 2     |       | 100 g flour  |
      | soup  | 2     |       | 120 g carrot |
      | curry | 2     |       | 150 g rice   |
      | stew  | 2     |       | 300 g beef   |
    And I am signed in as the User
    And the planner has finished

  Scenario: Friday dinner = pizza is planned without pinning the other days
    When I add a Slot Rule for the Dinner on Friday with the Recipe "pizza"
    Then the response status is 201
    When the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-13 has the Recipe "pizza"
    And the plan slot on 2026-11-13 has the why chip "slot_rule"
    And the plan slot on 2026-11-09 does not have the Recipe "pizza"
    And the plan slot on 2026-11-10 does not have the Recipe "pizza"
    And the plan slot on 2026-11-11 does not have the Recipe "pizza"
    And the plan slot on 2026-11-12 does not have the Recipe "pizza"

  Scenario: Regenerating keeps pizza for Friday
    Given I add a Slot Rule for the Dinner on Friday with the Recipe "pizza"
    And the planner has finished
    When I regenerate the plan
    And the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-13 has the Recipe "pizza"

  Scenario: A Tag rule with a single matching Recipe reserves it too
    When I add a Slot Rule for the Dinner on Friday with the Tag "pizza"
    And the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-13 has the Recipe "pizza"
    And the plan slot on 2026-11-09 does not have the Recipe "pizza"
    And the plan slot on 2026-11-10 does not have the Recipe "pizza"
    And the plan slot on 2026-11-11 does not have the Recipe "pizza"
    And the plan slot on 2026-11-12 does not have the Recipe "pizza"

  Scenario: Swap does not offer the reserved Recipe on an earlier day
    Two more Recipes leave more than three alternatives on Tuesday, so Swap offers three. Pizza
    stays out of them, strict or relaxed (crs-b design note, section 4). Once Friday holds pizza
    its Cool-down already keeps it out, so this scenario is an end-to-end guard only; the
    reservation itself is pinned by TestSwapRespectsReservations (Friday still empty).

    Given the planning Recipes:
      | name    | yield | tags | needs         |
      | risotto | 2     |      | 150 g rice    |
      | salad   | 2     |      | 100 g lettuce |
    And I pin the plan slot on 2026-11-09 as "pasta"
    And I pin the plan slot on 2026-11-10 as "soup"
    And I add a Slot Rule for the Dinner on Friday with the Recipe "pizza"
    And the planner has finished
    When I ask for alternatives for the slot on 2026-11-10
    Then the response status is 200
    And there are 3 alternatives
    And no alternative is the Recipe "pizza"

  Scenario: Pinned always wins: pizza pinned on Tuesday gives Friday a relaxed pick of pizza
    Given I pin the plan slot on 2026-11-10 as "pizza"
    When I add a Slot Rule for the Dinner on Friday with the Recipe "pizza"
    And the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-10 has the Recipe "pizza"
    And the plan slot on 2026-11-10 is pinned
    And the plan slot on 2026-11-13 has the Recipe "pizza"
    And the plan slot on 2026-11-13 has the why chip "cooldown_relaxed"
    And the plan slot on 2026-11-09 has a Planned Meal
    And the plan slot on 2026-11-11 has a Planned Meal
