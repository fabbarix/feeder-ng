Feature: Swap, set and confirm
  Swap shows the top 3 alternatives under the same scoring, each with why chips. Choosing
  one pins it and replans the downstream unpinned slots. Setting or confirming a meal pins it too.

  Background: Monday 2026-11-09 12:00 UTC, a three-day Planning Horizon
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 3 days ahead
    And the planning Recipes:
      | name  | yield | tags | needs        |
      | pasta | 2     |      | 100 g flour  |
      | soup  | 2     |      | 120 g carrot |
      | curry | 2     |      | 150 g rice   |
      | pizza | 2     |      | 200 g dough  |
      | stew  | 2     |      | 300 g beef   |
      | risotto | 2   |      | 180 g rice   |
      | salad | 2     |      | 80 g lettuce |
      | tacos | 2     |      | 120 g maize  |
    And I am signed in as the User
    And the planner has finished

  Scenario: Swap offers three other Recipes; an alternative with nothing to say has no chips
    Given I remember the Recipe planned on 2026-11-10
    When I ask for alternatives for the slot on 2026-11-10
    Then the response status is 200
    And there are 3 alternatives
    And none of the alternatives is the remembered Recipe
    And no alternative has more than 3 why chips and every chip has a code
    And the plan slot on 2026-11-10 has the remembered Recipe

  Scenario: Choosing an alternative pins it and replans the unpinned slots after it
    Given I remember the Recipe planned on 2026-11-11
    When I pin the plan slot on 2026-11-10 as "stew"
    Then the response status is 200
    And the plan JSON "recipeName" is "stew"
    And the plan JSON "pinned" is "true"
    When I view the plan
    Then the plan slot on 2026-11-10 is pinned
    And the plan slot on 2026-11-11 is not pinned
    And the plan slot on 2026-11-11 does not have the Recipe "stew"

  Scenario: Confirming a meal pins it as it is
    Given I remember the Recipe planned on 2026-11-10
    When I confirm the plan slot on 2026-11-10
    Then the response status is 200
    And the plan JSON "pinned" is "true"
    When I view the plan
    Then the plan slot on 2026-11-10 has the remembered Recipe

  Scenario: Setting a Recipe on an empty slot works and computes the Batches
    Given nobody usually attends the Dinner on 2026-11-11
    And the planner has finished
    When I pin the plan slot on 2026-11-11 as "pasta"
    Then the response status is 200
    And the plan JSON "batches" is "1"

  Scenario Outline: Things that cannot be set
    When I try to pin the plan slot on <date> as "<recipe>"
    Then the response status is <status>
    And the error code is "<code>"

    Examples:
      | date       | recipe | status | code            |
      | 2026-11-08 | pasta  | 422    | in_past         |
      | 2026-11-10 | ghost  | 422    | unknown_recipe  |

  Scenario: An archived Recipe cannot be planned
    Given I archive the planning Recipe "soup"
    When I try to pin the plan slot on 2026-11-10 as "soup"
    Then the response status is 422
    And the error code is "recipe_archived"

  Scenario: A Cooked meal cannot be swapped
    Given Monday's dinner is marked Cooked
    When I ask for alternatives for the slot on 2026-11-09
    Then the response status is 409
    And the error code is "not_swappable"

  Scenario: Planning needs a signed-in User
    Given I am not signed in
    When I GET "/api/plan"
    Then the response status is 401
