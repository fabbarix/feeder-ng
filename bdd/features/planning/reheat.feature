Feature: Reheat a Planned Meal served from a Leftover
  Today's hero offers Reheat (not Cook) for a Planned Meal served from a Leftover. Reheat opens a
  Reheat screen with a reheating timer scoped to that Planned Meal; a Leftover meal has no Steps,
  so Cook Mode itself stays closed to it. Marking the meal as Cooked consumes the portions from the
  Leftover, touches no Stock (the Stock was deducted when the Batch was cooked) and cancels the
  meal's timers, the Reheat timer included. The Reheat button and screen themselves are covered
  by the web tests (docs/dev/design/r12-reheat.md).

  Background: Monday 2026-11-09 dinner is chicken (Yield 4, two eat, 400 g thighs + 250 g rice per Batch); Tuesday 2026-11-10 is served from its 2 extra portions
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

  Scenario: Tuesday's dinner is a Leftover meal, so the hero offers Reheat and Cook Mode has nothing to cook
    When I view the plan
    Then the plan slot on 2026-11-10 is served from the Leftover of 2026-11-09
    When I open Cook Mode for the slot on 2026-11-10
    Then the response status is 409
    And the error code is "not_cookable"

  Scenario: Reheat starts a reheating timer scoped to that Planned Meal
    When I start the timer "Reheat" for 180 seconds on the meal of 2026-11-10
    Then the Cook timers are exactly "Reheat"
    And the Cook timer "Reheat" lasts 180 seconds on the meal of 2026-11-10

  Scenario: Marking the meal as Cooked consumes the Leftover, leaves Stock alone and cancels the Reheat timer
    Given I start the timer "Reheat" for 180 seconds on the meal of 2026-11-10
    And I start the free timer "Eggs" for 300 seconds
    When I mark the slot on 2026-11-10 as Cooked
    Then the response status is 200
    And the plan JSON "meal.state" is "cooked"
    And planning Stock holds 600 g of "chicken thighs" in total
    And planning Stock holds 750 g of "rice" in total
    And the Cook timers are exactly "Eggs"
    When I list the Leftovers
    Then the plan has no Leftovers

  Scenario: Cancelling the Reheat timer leaves the meal planned and the Leftover untouched
    Given I start the timer "Reheat" for 180 seconds on the meal of 2026-11-10
    When I cancel the Cook timer "Reheat"
    Then there are no Cook timers
    When I view the plan
    Then the plan slot on 2026-11-10 is planned
    And the plan slot on 2026-11-10 is served from the Leftover of 2026-11-09
    When I list the Leftovers
    Then the plan JSON "leftovers.0.portions" is "2"

  Scenario: Not cooked also cancels the Reheat timer and spares the Leftover
    Given I start the timer "Reheat" for 180 seconds on the meal of 2026-11-10
    When I mark the slot on 2026-11-10 as Not cooked
    Then the response status is 200
    And there are no Cook timers
    And planning Stock holds 600 g of "chicken thighs" in total
