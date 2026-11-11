Feature: Slot Rules and Variety Rules
  A Slot Rule fixes a Meal Slot to a Recipe or a Tag. A Variety Rule limits how often a
  Tag appears (per ISO week, and/or never on consecutive days). Any signed-in User may
  edit them (spec §2 lists only the allowlist, Members, Meal Slots, Shops, Weight Barcode
  Rules and settings as Admin duties).

  Background: Monday 2026-11-09 12:00 UTC, a seven-day Planning Horizon (Mon 9 to Sun 15)
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 7 days ahead
    And the planning Recipes:
      | name    | yield | tags | needs         |
      | pasta   | 2     | Pasta | 100 g flour  |
      | soup    | 2     |       | 120 g carrot |
      | curry   | 2     |       | 150 g rice   |
      | salmon  | 2     | Fish  | 200 g salmon |
      | cod     | 2     | Fish  | 200 g cod    |
      | trout   | 2     | fish  | 200 g trout  |
      | pizza   | 2     | Pizza | 200 g dough  |
    And I am signed in as the User
    And the planner has finished

  Scenario: A Slot Rule by Tag fixes Friday dinner to a matching Recipe with a Slot Rule chip
    Given I pin the plan slot on 2026-11-09 as "pasta"
    And I pin the plan slot on 2026-11-10 as "soup"
    And I pin the plan slot on 2026-11-11 as "curry"
    And I pin the plan slot on 2026-11-12 as "salmon"
    And the planner has finished
    When I add a Slot Rule for the Dinner on Friday with the Tag "pizza"
    Then the response status is 201
    And the plan JSON "tag" is "pizza"
    When the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-13 has the Recipe "pizza"
    And the plan slot on 2026-11-13 has the why chip "slot_rule"

  Scenario: A Slot Rule by Recipe
    Given I pin the plan slot on 2026-11-09 as "pasta"
    And I pin the plan slot on 2026-11-10 as "soup"
    And I pin the plan slot on 2026-11-11 as "pizza"
    And I pin the plan slot on 2026-11-12 as "salmon"
    And the planner has finished
    When I add a Slot Rule for the Dinner on Friday with the Recipe "curry"
    Then the response status is 201
    When the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-13 has the Recipe "curry"

  Scenario: Slot Rules are listed and can be removed
    Given I add a Slot Rule for the Dinner on Friday with the Tag "pizza"
    When I list the Slot Rules
    Then the plan JSON "0.tag" is "pizza"
    When I remove that Slot Rule
    Then the response status is 204
    When I remove that Slot Rule
    Then the response status is 404

  Scenario Outline: Invalid Slot Rules
    When I add a Slot Rule with <body>
    Then the response status is <status>
    And the error code is "<code>"

    Examples:
      | body                                                | status | code              |
      | both a Tag and a Recipe                             | 422    | validation_failed |
      | neither a Tag nor a Recipe                          | 422    | validation_failed |
      | an unknown Meal Slot                                | 422    | unknown_reference |
      | an unknown Recipe                                   | 422    | unknown_reference |

  Scenario: The same Slot Rule twice is a conflict
    Given I add a Slot Rule for the Dinner on Friday with the Tag "pizza"
    When I add a Slot Rule for the Dinner on Friday with the Tag "Pizza"
    Then the response status is 409
    And the error code is "duplicate_rule"

  Scenario: A Recipe named by a Slot Rule can only be archived, not deleted
    Given I add a Slot Rule for the Dinner on Friday with the Recipe "curry"
    When I delete the planning Recipe "curry"
    Then the response status is 409
    And the error code is "already_planned"

  Scenario: A Variety Rule caps a Tag per ISO week, whatever its spelling, until the Recipes run out
    When I set the Variety Rule "Fish" to at most 1 per week
    Then the response status is 200
    And the plan JSON "tag" is "fish"
    And the plan JSON "maxPerWeek" is "1"
    When the planner has finished
    And I view the plan
    Then the planned fresh meals tagged "fish" that keep the Variety Rule number at most 1

  Scenario: A Variety Rule can forbid consecutive days
    When I set the Variety Rule "pasta" to never on consecutive days
    And the planner has finished
    And I view the plan
    Then no two consecutive days both have a fresh meal tagged "pasta"

  Scenario: Variety Rules are listed and removed
    Given I set the Variety Rule "fish" to at most 2 per week
    When I list the Variety Rules
    Then the plan JSON "0.tag" is "fish"
    When I remove the Variety Rule "fish"
    Then the response status is 204
    When I remove the Variety Rule "fish"
    Then the response status is 404

  Scenario Outline: Invalid Variety Rules
    When I set the Variety Rule "fish" with JSON <body>
    Then the response status is 422
    And the error code is "validation_failed"

    Examples:
      | body                                          |
      | {"maxPerWeek": 0, "notConsecutiveDays": false} |
      | {"maxPerWeek": -1}                             |
      | {"maxPerWeek": 22}                             |
