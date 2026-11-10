Feature: Reheat uses the Recipe's reheat time
  A Planned Meal served from a Leftover carries its Recipe's reheat time, so the Reheat screen starts its timer
  at that time. Without a reheat time on the Recipe the screen falls back to its formula (2 minutes for one portion,
  1 minute more for each further portion, at most 10). The default itself is computed by the web client and covered
  by the web tests (docs/dev/design/r12-reheat.md); the timer still starts through the ordinary timer API.

  Background: Monday 2026-11-09 dinner is chicken (Yield 4, two eat); Tuesday 2026-11-10 is served from its 2 extra portions
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
    And planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    And I mark the slot on 2026-11-09 as Cooked
    And the household clock is 2026-11-10 18:00 UTC

  Scenario: A Recipe with a reheat time hands it to its Leftover meal
    Given the planning Recipe "chicken" has a reheat time of 5 minutes
    When I view the plan
    Then the plan slot on 2026-11-10 is served from the Leftover of 2026-11-09
    And the plan slot on 2026-11-10 has a reheat time of 5 minutes

  Scenario: A Recipe without one sends none, so Reheat uses the formula
    When I view the plan
    Then the plan slot on 2026-11-10 is served from the Leftover of 2026-11-09
    And the plan slot on 2026-11-10 has no reheat time

  Scenario: The Reheat timer starts at the Recipe's reheat time
    Given the planning Recipe "chicken" has a reheat time of 5 minutes
    When I start the timer "Reheat" for 300 seconds on the meal of 2026-11-10
    Then the Cook timer "Reheat" lasts 300 seconds on the meal of 2026-11-10
