@tg-r
Feature: A rule names a Tag that exists
  A new Slot Rule or Variety Rule must name a Tag the household has (ADR 0010, spec 17): a rule naming no Tag
  would be invisible on the Tags page and would never follow a rename. Recipe Slot Rules are unaffected and rules
  that already name an unknown key still read and can be removed.

  Background: Monday 2026-11-09 12:00 UTC, a seven-day Planning Horizon (Mon 9 to Sun 15)
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 7 days ahead
    And the planning Recipes:
      | name  | yield | tags  | needs        |
      | curry | 2     |       | 150 g rice   |
      | salmon | 2    | Fish  | 200 g salmon |
      | pizza | 2     | Pizza | 200 g dough  |
    And I am signed in as the User
    And the planner has finished

  Scenario: A Slot Rule naming no Tag is refused
    When I add a Slot Rule for the Dinner on Friday with the Tag "dessert"
    Then the response status is 422
    And the error code is "tag_unknown"
    And the response JSON field "error.field" is "tag"
    When I list the Slot Rules
    Then no Slot Rule names a Tag

  Scenario: Another spelling of an existing Tag is accepted with its key
    When I add a Slot Rule for the Dinner on Friday with the Tag "  PIZZA "
    Then the response status is 201
    And the plan JSON "tag" is "pizza"

  Scenario: A Tag added on the Tags page can be named at once
    When I add the Tag "Dessert"
    And I add a Slot Rule for the Dinner on Friday with the Tag "dessert"
    Then the response status is 201

  Scenario: A Slot Rule naming a Recipe needs no Tag
    When I add a Slot Rule for the Dinner on Friday with the Recipe "curry"
    Then the response status is 201

  Scenario: A Variety Rule naming no Tag is refused
    When I set the Variety Rule "dessert" to at most 1 per week
    Then the response status is 422
    And the error code is "tag_unknown"
    And the response JSON field "error.field" is "tag"
    When I list the Variety Rules
    Then no Variety Rule names a Tag

  Scenario: A Variety Rule in another spelling of an existing Tag is accepted with its key
    When I set the Variety Rule "FISH" to at most 1 per week
    Then the response status is 200
    And the plan JSON "tag" is "fish"

  Scenario: A rule that already names an unknown key still reads and can be removed
    Given a Slot Rule names the Tag "ghost" for the Meal Slot "Dinner" on Friday in the Course "Main"
    And a Variety Rule names the Tag "phantom" with at most 2 a week
    When I list the Slot Rules
    Then the response status is 200
    And the plan JSON "0.tag" is "ghost"
    When I list the Variety Rules
    Then the plan JSON "0.tag" is "phantom"
    When I remove the Variety Rule "phantom"
    Then the response status is 204
