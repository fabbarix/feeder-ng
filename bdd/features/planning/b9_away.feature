@away @area-planning
Feature: A Member who is away for days (Away)
  An Away belongs to a Member: a first day and, when known, a last day. The planner leaves the Member out of Attendance
  on those dates, also past the Planning Horizon, and a write that adds, changes or ends one says what it changed and can
  be undone (beta.9, PC-08, ADR 0025). The sheet, the day tile and the toast are covered by the web tests of the Away UI
  package; the day tile's wording by `away.ts`. Here: what the API does.

  Background: Monday 2026-11-09 12:00 UTC. Anna and Ben eat the Dinner at 19:00 every day (2 portions); the plan covers 5 days
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 5 days ahead
    And the planning Recipes:
      | name  | yield | tags | needs       |
      | pasta | 2     |      | 100 g flour |
      | soup  | 2     |      | 120 g carrot |
      | curry | 2     |      | 150 g rice  |
    And I am signed in as the User
    And the planner has finished

  Scenario: I mark a Member away for three days in one step
    When I mark "Ben" away from 2026-11-10 through 2026-11-12
    Then the response status is 201
    And the answer has an undo token
    And the plan slot on 2026-11-10 has 1 portions
    And the plan slot on 2026-11-11 has 1 portions
    And the plan slot on 2026-11-12 has 1 portions
    And the plan slot on 2026-11-09 has 2 portions
    And the plan slot on 2026-11-13 has 2 portions

  Scenario: A Member's Away reaches past the plan and is used when those days are planned
    When I mark "Ben" away from 2026-11-16 through 2026-11-18
    Then the response status is 201
    And the plan slot on 2026-11-16 has 1 portions
    When the household clock is 2026-11-12 12:00 UTC
    And the scheduler runs its due jobs
    Then the plan slot on 2026-11-16 has a Planned Meal
    And the plan slot on 2026-11-16 has 1 portions
    And the plan slot on 2026-11-19 has 2 portions

  Scenario: An Away with no last day lasts until I end it
    When I mark "Ben" away from 2026-11-10 with no last day
    Then the response status is 201
    When the household clock is 2026-11-12 12:00 UTC
    And the scheduler runs its due jobs
    Then the plan slot on 2026-11-16 has 1 portions
    When I end the Away of "Ben"
    Then the response status is 200
    And the plan slot on 2026-11-12 has 2 portions
    And the plan slot on 2026-11-16 has 2 portions

  Scenario: The day tile says who is away
    When I mark "Ben" away from 2026-11-10 through 2026-11-11
    And I view the plan from 2026-11-10 to 2026-11-12
    Then the plan slot on 2026-11-10 lists "Ben" as away
    And the plan slot on 2026-11-11 lists "Ben" as away
    And the plan slot on 2026-11-12 lists nobody as away
    And the plan lists the Away of "Ben"

  Scenario: A Member who is away can still eat at one Meal Slot
    Given I mark "Ben" away from 2026-11-10 through 2026-11-12
    When "Ben" eats at the Dinner on 2026-11-11 anyway
    Then the response status is 200
    And the plan slot on 2026-11-11 has 2 portions
    And the plan slot on 2026-11-10 has 1 portions
    And the plan slot on 2026-11-12 has 1 portions

  Scenario: I cannot add an Away that overlaps another
    Given I mark "Ben" away from 2026-11-10 through 2026-11-11
    When I try to mark "Ben" away from 2026-11-11 through 2026-11-13
    Then the response status is 422
    And the error reason is "overlap"
    And "Ben" has 1 Away

  Scenario: I see which meals an Away changes before I save it
    When I preview marking "Ben" away from 2026-11-10 through 2026-11-11
    Then the response status is 200
    And the preview says 2 Meal Slots are without "Ben" and 2 meals change
    And "Ben" has 0 Aways
    And the plan slot on 2026-11-10 has 2 portions

  Scenario: I undo an Away and the plan is as it was
    Given I remember the plan
    When I mark "Ben" away from 2026-11-10 through 2026-11-12
    And I undo the change
    Then the response status is 200
    And the plan is as I remembered it
    And "Ben" has 0 Aways
    And the plan slot on 2026-11-11 has 2 portions

  Scenario: Ending an Away today brings the Member back from the next Meal Slot
    Given I mark "Ben" away from 2026-11-09 through 2026-11-13
    And the household clock is 2026-11-10 20:00 UTC
    When I end the Away of "Ben"
    Then the response status is 200
    And the plan slot on 2026-11-10 has 1 portions
    And the plan slot on 2026-11-11 has 2 portions
