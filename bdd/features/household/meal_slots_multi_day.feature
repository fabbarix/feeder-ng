Feature: Edit a Meal Slot on several days
  Editing a Meal Slot can apply to several weekdays at once. It changes the Meal Slot with the same name on
  each chosen weekday; a chosen weekday without one is skipped and reported. The whole edit is atomic.

  Background:
    Given a running Feeder
    And I am signed in as the Admin
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Sam" with Portion Factor 0.5
    And the Household has the Meal Slot "Dinner" on Monday at 19:00 attended by "Anna"
    And the Household has the Meal Slot "Dinner" on Tuesday at 19:00 attended by "Anna"
    And the Household has the Meal Slot "Dinner" on Wednesday at 19:00 attended by "Anna"
    And the Household has the Meal Slot "Lunch" on Thursday at 12:30 attended by "Anna"

  Scenario: Edit Dinner on Monday, Tuesday and Wednesday in one call
    When the Admin changes the time of "Dinner" on Monday, Tuesday and Wednesday to 19:45
    Then the response status is 200
    And the batch updated "Dinner" on Monday, Tuesday and Wednesday
    And the Meal Slot "Dinner" on Monday is at 19:45
    And the Meal Slot "Dinner" on Tuesday is at 19:45
    And the Meal Slot "Dinner" on Wednesday is at 19:45

  Scenario: A day without a Dinner is skipped and reported
    When the Admin changes the time of "Dinner" on Monday, Tuesday and Thursday to 20:15
    Then the response status is 200
    And the batch updated "Dinner" on Monday and Tuesday
    And the batch skipped Thursday
    And the Meal Slot "Lunch" on Thursday is at 12:30
    And the Meal Slot "Dinner" on Wednesday is at 19:00

  Scenario: Attendance applies to every matching day
    When the Admin makes "Sam" attend "Dinner" on Monday and Tuesday
    Then the Meal Slot "Dinner" on Monday is attended by "Anna" and "Sam"
    And the Meal Slot "Dinner" on Tuesday is attended by "Anna" and "Sam"
    And the Meal Slot "Dinner" on Wednesday is attended by "Anna"

  Scenario: One day that cannot be changed stops the whole edit
    Given the Household has the Meal Slot "Supper" on Tuesday at 20:00 attended by "Anna"
    When the Admin renames "Dinner" on Monday and Tuesday to "Supper"
    Then the response status is 409
    And the Meal Slot "Dinner" on Monday is at 19:00
    And the Meal Slot "Dinner" on Tuesday is at 19:00
