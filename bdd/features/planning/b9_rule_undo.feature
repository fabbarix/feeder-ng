@b9 @b951
Feature: A removed planning rule can be put back
  Removing a Slot Rule or a Variety Rule in Settings acts at once and offers Undo. The Undo is no server feature of its own: the app
  puts the rule back with the inverse call (SAFE-02, "Light removals"). These scenarios pin that this inverse is available and gives
  the rule back as it was. (B9-51. The toast and the Undo button are covered by the web tests of Planning rules.)

  Background: Monday 2026-11-09 12:00 UTC, a seven-day Planning Horizon (Mon 9 to Sun 15)
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 7 days ahead
    And the planning Recipes:
      | name  | yield | tags  | needs        |
      | pizza | 2     | Pizza | 200 g dough  |
      | cod   | 2     | Fish  | 200 g cod    |
    And I am signed in as the User
    And the planner has finished

  Scenario: A removed Slot Rule is put back by adding it again
    Given I add a Slot Rule for the Dinner on Friday with the Tag "pizza"
    When I remove that Slot Rule
    Then the response status is 204
    When I add a Slot Rule for the Dinner on Friday with the Tag "pizza"
    Then the response status is 201
    When I list the Slot Rules
    Then the plan JSON "0.tag" is "pizza"

  Scenario: A removed Variety Rule is put back with the same limits
    Given I set the Variety Rule "fish" to at most 2 per week
    When I remove the Variety Rule "fish"
    Then the response status is 204
    When I set the Variety Rule "fish" to at most 2 per week
    Then the response status is 200
    When I list the Variety Rules
    Then the plan JSON "0.tag" is "fish"
    And the plan JSON "0.maxPerWeek" is "2"
