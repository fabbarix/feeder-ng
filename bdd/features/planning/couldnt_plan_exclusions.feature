@crs-crx
Feature: Review Exclusions says which Exclusions left a Course empty
  When every Recipe of a Course is excluded for someone who eats it, Couldn't plan files the Course under Excluded.
  GET /api/plan/couldnt-plan/exclusions names the Exclusions behind each such Course: who excludes what, and which
  Recipes it rules out (docs/dev/design/rx-pt.md section 3, crs-crx.md). The planner records the detail; the API
  resolves the names when it reads.

  Background: Monday 2026-11-09 12:00 UTC, a Dinner at 19:00 serving Main, Side and Dessert for Anna and Sam
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main", "Side" and "Dessert" attended by Anna and Sam
    And the C2 Recipe "Roast chicken" for the Course "Main" uses 300 g of "chicken" and has no Steps
    And the C2 Recipe "Garlic beans" for the Course "Side" uses 100 g of "garlic" and has no Steps
    And the C2 Recipe "Garlic leeks" for the Course "Side" uses 100 g of "garlic" and has no Steps
    And the C2 Recipe "Garlic peas" for the Course "Side" uses 100 g of "garlic" and has no Steps
    And the C2 Recipe "Tiramisu" for the Course "Dessert" uses 100 g of "mascarpone" and has no Steps
    And the C2 plan is empty

  Scenario: Sam excludes garlic and every Side has garlic
    Given the C2 Member "Sam" excludes the C2 Ingredient "garlic"
    When the planner replans everything
    And I list the Review Exclusions cells
    Then the response status is 200
    And the Review Exclusions list has 1 cells
    And the Review Exclusions cell 1 is the Course "Side" on 2026-11-09
    And the Review Exclusions cell 1 is eaten by "Anna" and "Sam" and skipped by nobody
    And the Review Exclusions cell 1 has 1 records
    And the Review Exclusions cell 1 record 1 is the Exclusion of "garlic" by "Sam" ruling out 3 Recipes: "Garlic beans", "Garlic leeks", "Garlic peas"
    And the Review Exclusions cell 1 has no more Exclusions

  Scenario: Sam excludes the only Dessert directly
    Given the C2 Member "Sam" excludes the C2 Recipe "Tiramisu"
    When the planner replans everything
    And I list the Review Exclusions cells
    Then the Review Exclusions list has 1 cells
    And the Review Exclusions cell 1 is the Course "Dessert" on 2026-11-09
    And the Review Exclusions cell 1 record 1 is the direct Exclusion by "Sam" ruling out 1 Recipes: "Tiramisu"

  Scenario: A Member who opts out of the Course does not count
    Given the C2 Member "Sam" opts out of the Course "Dessert" at that Dinner
    And the C2 Member "Sam" excludes the C2 Recipe "Tiramisu"
    When the planner replans everything
    And I list the Review Exclusions cells
    Then the Review Exclusions list has 0 cells
    When I view the C2 plan for 2026-11-09
    Then the C2 Course "Dessert" holds "Tiramisu"

  Scenario: The cell says who eats the Course and who opts out of it
    Given the C2 Member "Anna" opts out of the Course "Side" at that Dinner
    And the C2 Member "Sam" excludes the C2 Ingredient "garlic"
    When the planner replans everything
    And I list the Review Exclusions cells
    Then the Review Exclusions list has 1 cells
    And the Review Exclusions cell 1 is the Course "Side" on 2026-11-09
    And the Review Exclusions cell 1 is eaten by "Sam" and skipped by "Anna"
    And the Review Exclusions cell 1 record 1 is the Exclusion of "garlic" by "Sam" ruling out 3 Recipes: "Garlic beans", "Garlic leeks", "Garlic peas"

  Scenario: Removing the Exclusion replans and the cell goes
    Given the C2 Member "Sam" excludes the C2 Ingredient "garlic"
    And the planner replans everything
    And I list the Review Exclusions cells
    And the Review Exclusions list has 1 cells
    When the C2 Member "Sam" no longer excludes the C2 Ingredient "garlic"
    And the planner replans everything
    And I list the Review Exclusions cells
    Then the Review Exclusions list has 0 cells

  Scenario Outline: A Course that Exclusions did not empty is not listed
    Given the C2 plan could not fill the Course "Side" on 2026-11-09 because "<reason>"
    When I list the Review Exclusions cells
    Then the Review Exclusions list has 0 cells

    Examples:
      | reason            |
      | no_candidates     |
      | no_course_recipes |
      | no_attendance     |

  Scenario: A reason stored before the detail was recorded has no detail yet
    Given the C2 plan could not fill the Course "Side" on 2026-11-09 with 3 Recipes excluded and no detail stored
    When I list the Review Exclusions cells
    Then the Review Exclusions list has 1 cells
    And the Review Exclusions cell 1 is the Course "Side" on 2026-11-09
    And the Review Exclusions cell 1 has no detail yet

  Scenario: Only a signed-in User may read it
    Given I am not signed in
    When I list the Review Exclusions cells
    Then the response status is 401
