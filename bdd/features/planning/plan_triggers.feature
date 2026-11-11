Feature: When the planner runs
  The planner fills the Planning Horizon every night at 03:00 (household time), straight
  after a change that invalidates the plan, and on demand with Regenerate. It never
  changes a Pinned or Cooked Planned Meal.

  Background: Monday 2026-11-09 12:00 UTC, a three-day Planning Horizon (Mon 9 to Wed 11)
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 3 days ahead
    And the planning Recipes:
      | name  | yield | tags | needs         |
      | pasta | 2     |      | 100 g flour   |
      | soup  | 2     |      | 120 g carrot  |
      | curry | 2     |      | 150 g rice    |
      | pizza | 2     |      | 200 g dough   |
      | stew  | 2     |      | 300 g beef    |
    And I am signed in as the User
    And the planner has finished

  Scenario: Creating the household and its Recipes already fills the horizon
    When I view the plan
    Then the response status is 200
    And the plan has 3 slots
    And every plan slot has a Planned Meal that is not pinned
    And the plan slot on 2026-11-09 has 2 portions

  Scenario: The nightly run at 03:00 extends the plan to the new horizon and keeps valid meals
    Given I remember the Recipe planned on 2026-11-10
    When the household clock is 2026-11-10 02:59 UTC
    And the scheduler runs its due jobs
    And I view the plan from 2026-11-10 to 2026-11-12
    Then the plan slot on 2026-11-12 is empty
    When the household clock is 2026-11-10 03:00 UTC
    And the scheduler runs its due jobs
    And I view the plan from 2026-11-10 to 2026-11-12
    Then the plan slot on 2026-11-12 has a Planned Meal
    And the plan slot on 2026-11-10 has the remembered Recipe

  Scenario: Archiving a Recipe replans the meal that used it
    Given I remember the Recipe planned on 2026-11-10
    When I archive the remembered planning Recipe
    And the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-10 has a Planned Meal
    And the plan slot on 2026-11-10 does not have the remembered Recipe

  Scenario: Changing Attendance replans, and an empty table explains itself
    When nobody attends the Dinner on 2026-11-10
    And the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-10 is empty
    And the plan slot on 2026-11-10 could not be planned because "no_attendance"
    When I list the slots the planner could not plan
    Then the response status is 200
    And the plan JSON "slots.0.date" is "2026-11-10"
    And the plan JSON "slots.0.unfilled.reason" is "no_attendance"

  Scenario: Every option excluded is reported with counts
    Given every planning Recipe is archived
    And the planner has finished
    When I regenerate the plan
    And I view the plan
    Then the plan slot on 2026-11-10 could not be planned because "no_candidates"

  Scenario: Every option in Cool-down gives a relaxed pick with an Again soon chip, not Couldn't plan
    Given every planning Recipe except "pasta" is archived
    And the planner has finished
    When I regenerate the plan
    And I view the plan
    Then the plan slot on 2026-11-10 has the Recipe "pasta"
    And the plan slot on 2026-11-10 has the why chip "cooldown_relaxed"
    And the plan slot on 2026-11-11 has the Recipe "pasta"
    And the plan slot on 2026-11-11 has the why chip "cooldown_relaxed"

  Scenario: Unpinning a meal runs the planner and leaves the meal in place while it is valid
    Given I pin the plan slot on 2026-11-10 as "curry"
    When I unpin the plan slot on 2026-11-10
    Then the response status is 200
    And the plan JSON "pinned" is "false"
    And the plan JSON "recipeName" is "curry"

  Scenario: Regenerate redoes unpinned meals but never a Pinned one
    Given I pin the plan slot on 2026-11-10 as "curry"
    When I regenerate the plan
    Then the response status is 200
    And I view the plan
    And the plan slot on 2026-11-10 has the Recipe "curry"
    And the plan slot on 2026-11-10 is pinned
    And the plan has 3 slots
    And every plan slot has a Planned Meal

  Scenario: Regenerate needs a signed-in User
    Given I am not signed in
    When I POST "/api/plan/regenerate"
    Then the response status is 401
