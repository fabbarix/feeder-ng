Feature: Meal Slots
  Meal Slots are defined per weekday with a name, a usual time and a default
  Attendance. Portions needed is the sum of the attending Members' Portion Factors.

  Background:
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Marco" with Portion Factor 1
    And the Household has the Member "Sam" with Portion Factor 0.5

  Scenario: Portions needed is the sum of Portion Factors
    Given the Household has the Meal Slot "Dinner" on Tuesday at 19:30 attended by "Anna", "Marco" and "Sam"
    Then the Meal Slot "Dinner" on Tuesday needs 2.5 portions

  Scenario: A Portion Factor override applies to that Meal Slot only
    Given the Household has the Meal Slot "Lunch" on Saturday at 12:30 attended by "Anna" and "Sam" with Sam at 1.5
    Then the Meal Slot "Lunch" on Saturday needs 2.5 portions
    And the Member "Sam" still has Portion Factor 0.5

  Scenario: The same name can exist on several weekdays with different times
    Given the Household has the Meal Slot "Dinner" on Monday at 19:00 attended by "Anna"
    And the Household has the Meal Slot "Dinner" on Friday at 20:30 attended by "Anna" and "Marco"
    Then the Meal Slot "Dinner" on Monday needs 1 portions
    And the Meal Slot "Dinner" on Friday needs 2 portions

  Scenario: A weekday cannot have two Meal Slots with the same name
    Given the Household has the Meal Slot "Dinner" on Monday at 19:00 attended by "Anna"
    And I am signed in as the Admin
    When I POST "/api/meal-slots" with JSON:
      """
      {"weekday": 1, "name": "Dinner", "time": "21:00", "attendance": []}
      """
    Then the response status is 409
    And the error code is "duplicate_slot"

  Scenario: Only the Admin defines Meal Slots
    Given I am signed in as the User
    When I POST "/api/meal-slots" with JSON:
      """
      {"weekday": 1, "name": "Dinner", "time": "19:00", "attendance": []}
      """
    Then the response status is 403
    When I GET "/api/meal-slots"
    Then the response status is 200

  Scenario: Removing a Member from the Household lowers the portions needed
    Given the Household has the Meal Slot "Dinner" on Tuesday at 19:30 attended by "Anna", "Marco" and "Sam"
    When the Admin deletes the Member "Sam"
    Then the Meal Slot "Dinner" on Tuesday needs 2 portions
