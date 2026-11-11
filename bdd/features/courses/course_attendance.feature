@crs-c1
Feature: Course Attendance for one date
  The Date Attendance sheet shows, per Course of the Meal Slot, who eats it that day (ADR 0008 point 8, spec 3.1).
  Changing it records that Course's opt-outs for that date, which replace its usual ones.

  Background:
    Given a running Feeder
    And I am signed in as the Admin
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Sam" with Portion Factor 0.5
    And the Household has the Member "Marco" with Portion Factor 1
    And the Household has the Meal Slot "Dinner" on Thursday at 19:00 attended by "Anna", "Sam" and "Marco"
    And the Admin saves the Meal Slot "Dinner" on Thursday with the Courses "Main", "Side" without "Sam", "Dessert" optional

  Scenario: The date lists who eats each Course, in the slot's order
    When on 2026-11-12 I read the Attendance of the Meal Slot "Dinner" on Thursday
    Then the response status is 200
    And the answer JSON at "courses.0.name" is "Main"
    And the answer JSON at "courses.1.name" is "Side"
    And the answer JSON at "courses.2.name" is "Dessert"
    And the Course "Main" is eaten by "Anna", "Sam" and "Marco" for 2.5 portions
    And the Course "Side" is eaten by "Anna" and "Marco" for 2 portions
    And the Course "Side" has no own opt-outs for that date

  Scenario: A date's opt-outs replace the usual ones for that date only
    When on 2026-11-12 the Admin sets the opt-outs of the Course "Side" at the Meal Slot "Dinner" on Thursday to "Anna"
    Then the response status is 200
    And the Course "Side" is eaten by "Sam" and "Marco" for 1.5 portions
    And the Course "Side" has own opt-outs for that date
    And the answer JSON at "isOverride" is "false"
    When on 2026-11-19 I read the Attendance of the Meal Slot "Dinner" on Thursday
    Then the Course "Side" is eaten by "Anna" and "Marco" for 2 portions
    And the Course "Side" has no own opt-outs for that date

  Scenario: An empty list puts everyone back and null returns to the usual opt-outs
    When on 2026-11-12 the Admin sets the opt-outs of the Course "Side" at the Meal Slot "Dinner" on Thursday to nobody
    Then the Course "Side" is eaten by "Anna", "Sam" and "Marco" for 2.5 portions
    When on 2026-11-12 the Admin resets the Course "Side" at the Meal Slot "Dinner" on Thursday to usual
    Then the response status is 200
    And the Course "Side" is eaten by "Anna" and "Marco" for 2 portions
    And the Course "Side" has no own opt-outs for that date

  Scenario: Course opt-outs follow the date's Attendance
    When on 2026-11-12 the Admin sets the opt-outs of the Course "Side" at the Meal Slot "Dinner" on Thursday to "Anna" while "Marco" is away
    Then the response status is 200
    And the answer JSON at "isOverride" is "true"
    And the Course "Main" is eaten by "Anna" and "Sam" for 1.5 portions
    And the Course "Side" is eaten by "Sam" for 0.5 portions

  Scenario: Reset to usual Attendance also drops the date's Course opt-outs
    Given on 2026-11-12 the Admin sets the opt-outs of the Course "Dessert" at the Meal Slot "Dinner" on Thursday to "Anna"
    When I reset the Attendance of the Meal Slot "Dinner" on Thursday on 2026-11-12
    Then the response status is 204
    When on 2026-11-12 I read the Attendance of the Meal Slot "Dinner" on Thursday
    Then the Course "Dessert" has no own opt-outs for that date

  Scenario: A Course that is not on the Meal Slot is refused
    When on 2026-11-12 the Admin sets the opt-outs of a Course that is not on the Meal Slot "Dinner" on Thursday
    Then the response status is 422
    And the error code is "validation_failed"
    And the error names the field "courses[0].courseId" and the reason "course_not_in_slot"

  Scenario: A request that changes nothing is refused
    When on 2026-11-12 the Admin sends no Attendance and no Courses for the Meal Slot "Dinner" on Thursday
    Then the response status is 422
    And the error names the field "attendance" and the reason "nothing_to_change"
