@tg-api
Feature: Tag changes replan as a rule edit does
  A rename, merge or delete that moves or removes a Slot Rule or Variety Rule updates the plan as a rule edit
  does (spec 4.1, 7.1): unpinned Planned Meals are replanned, Pinned ones stay.

  Background: Monday 2026-11-09 12:00 UTC, a seven-day Planning Horizon (Mon 9 to Sun 15)
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 7 days ahead
    And the planning Recipes:
      | name    | yield | tags  | needs        |
      | pasta   | 2     | Pasta | 100 g flour  |
      | soup    | 2     |       | 120 g carrot |
      | curry   | 2     |       | 150 g rice   |
      | salmon  | 2     | Fish  | 200 g salmon |
      | cod     | 2     | Fish  | 200 g cod    |
      | trout   | 2     | fish  | 200 g trout  |
      | pizza   | 2     | Pizza | 200 g dough  |
    And I am signed in as the User
    And the planner has finished

  Scenario: Deleting a Tag clears the unpinned meal its Slot Rule placed and replans without the rule
    Given I pin the plan slot on 2026-11-09 as "pasta"
    And I pin the plan slot on 2026-11-10 as "soup"
    And I pin the plan slot on 2026-11-11 as "curry"
    And I pin the plan slot on 2026-11-12 as "pizza"
    And I add a Slot Rule for the Dinner on Friday with the Tag "fish"
    And the planner has finished
    When I view the plan
    Then the plan slot on 2026-11-13 has a Recipe tagged "fish"
    And the plan slot on 2026-11-13 has the why chip "slot_rule"
    And the plan slot on 2026-11-13 is not pinned
    When I delete the Tag "Fish"
    Then the response status is 204
    When the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-13 does not have the why chip "slot_rule"
    And the plan slot on 2026-11-13 has a Planned Meal

  Scenario: A Pinned meal stays when the Tag it was pinned for is deleted
    Given I pin the plan slot on 2026-11-09 as "pasta"
    And I pin the plan slot on 2026-11-10 as "soup"
    And I pin the plan slot on 2026-11-11 as "curry"
    And I pin the plan slot on 2026-11-12 as "pizza"
    And I pin the plan slot on 2026-11-13 as "salmon"
    And I add a Slot Rule for the Dinner on Friday with the Tag "fish"
    And the planner has finished
    When I delete the Tag "Fish"
    Then the response status is 204
    When the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-13 has the Recipe "salmon"
    And the plan slot on 2026-11-13 is pinned

  Scenario: Renaming a Tag keeps the Slot Rule that placed a meal
    Given I pin the plan slot on 2026-11-09 as "pasta"
    And I pin the plan slot on 2026-11-10 as "soup"
    And I pin the plan slot on 2026-11-11 as "curry"
    And I pin the plan slot on 2026-11-12 as "pizza"
    And I add a Slot Rule for the Dinner on Friday with the Tag "fish"
    And the planner has finished
    When I rename the Tag "Fish" to "Seafood"
    Then the response status is 200
    And the Slot Rules name only the Tag "seafood"
    When the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-13 has a Recipe tagged "seafood"
    And the plan slot on 2026-11-13 has the why chip "slot_rule"

  Scenario: A Variety Rule still holds after its Tag is renamed
    Given I set the Variety Rule "fish" to at most 1 per week
    And the planner has finished
    When I rename the Tag "Fish" to "Seafood"
    Then the response status is 200
    And the Variety Rules name only the Tag "seafood"
    When the planner has finished
    And I view the plan
    Then the planned fresh meals whose Recipe carries the Tag "Seafood" and keep the Variety Rule number at most 1
