@away
Feature: A Member's Aways on the Members list and in the Member sheet (SET-16)
  The Members list names each Member's next Away and the Member sheet lists them, soonest first, with the first Meal Slot an Away
  misses. An Away that has ended is not listed. The wording and the rows are covered by the web tests of the Away UI package
  (`settings/lib/away.ts`); here: what the API gives them (beta.9, PC-08 and SET-16).

  Background: Monday 2026-11-09 12:00 UTC. Anna and Ben eat the Dinner at 19:00 every day
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 5 days ahead
    And the planning Recipes:
      | name  | yield | tags | needs       |
      | pasta | 2     |      | 100 g flour |
    And I am signed in as the Admin
    And the planner has finished

  Scenario: A Member away next week shows "Away" on the Members list
    Given I mark "Ben" away from 2026-11-16 through 2026-11-18
    And I mark "Ben" away from 2026-11-12 through 2026-11-13
    Then "Ben" has 2 Aways
    And the Aways of "Ben" start on 2026-11-12 and on 2026-11-16, soonest first

  Scenario: An Away with no last day yet is listed as open
    When I mark "Ben" away from 2026-12-01 with no last day
    Then the Away of "Ben" on 2026-12-01 is not started and has no last day yet

  Scenario: An Admin adds an Away from the Member sheet, starting at a Meal Slot
    When I mark "Ben" away from the Dinner on 2026-11-11 through 2026-11-13
    Then the response status is 201
    And the Away of "Ben" on 2026-11-11 starts at the Dinner

  Scenario: An Away that has ended is no longer listed
    Given I mark "Ben" away from 2026-11-09 through 2026-11-13
    And the household clock is 2026-11-10 20:00 UTC
    When I end the Away of "Ben"
    Then the response status is 200
    And "Ben" has 0 Aways
