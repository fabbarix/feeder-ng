Feature: Attendance for a particular date
  A one-off change ("Sam is away Thursday") edits that date's Attendance
  only; the Meal Slot's usual Attendance and other dates stay as they were.

  Background:
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Marco" with Portion Factor 1
    And the Household has the Member "Sam" with Portion Factor 0.5
    And the Household has the Meal Slot "Dinner" on Thursday at 19:00 attended by "Anna", "Marco" and "Sam"

  Scenario: Sam is away Thursday
    Given I am signed in as the User
    When "Sam" is away from the Meal Slot "Dinner" on Thursday on 2026-11-12
    Then the response status is 200
    And on 2026-11-12 the Meal Slot "Dinner" on Thursday needs 2 portions
    And on 2026-11-19 the Meal Slot "Dinner" on Thursday needs 2.5 portions
    And the Meal Slot "Dinner" on Thursday needs 2.5 portions

  Scenario: Resetting a date returns to the usual Attendance
    Given I am signed in as the User
    And "Sam" is away from the Meal Slot "Dinner" on Thursday on 2026-11-12
    When I reset the Attendance of the Meal Slot "Dinner" on Thursday on 2026-11-12
    Then the response status is 204
    And on 2026-11-12 the Meal Slot "Dinner" on Thursday needs 2.5 portions

  Scenario: An override survives a restart
    Given I am signed in as the User
    And "Sam" is away from the Meal Slot "Dinner" on Thursday on 2026-11-12
    When the Feeder is restarted
    Then on 2026-11-12 the Meal Slot "Dinner" on Thursday needs 2 portions

  Scenario: The date must fall on the Meal Slot's weekday
    Given I am signed in as the User
    When "Sam" is away from the Meal Slot "Dinner" on Thursday on 2026-11-11
    Then the response status is 422
    And the error code is "weekday_mismatch"

  Scenario: Everyone is out one evening
    Given I am signed in as the User
    When nobody attends the Meal Slot "Dinner" on Thursday on 2026-11-12
    Then on 2026-11-12 the Meal Slot "Dinner" on Thursday needs 0 portions
