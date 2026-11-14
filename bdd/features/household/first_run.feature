@b9
Feature: First run: Meal Slots in one go, the hidden checklist, and the Household's time zone
  The first-run checklist on Today creates the Meal Slots of a new Household in one request, hides itself when the
  Admin says so, and the shell learns the Household's time zone from the current User. Today is Monday 2026-11-09.

  Background:
    Given a running Feeder
    And I am signed in as the Admin
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Ben" with Portion Factor 0.5

  Scenario: Lunch and Dinner are created for every weekday, and everyone attends
    When I POST "/api/meal-slots/batch" with JSON:
      """
      {"slots": [{"name": "Lunch", "time": "13:00", "weekdays": [1,2,3,4,5,6,7]},
                 {"name": "Dinner", "time": "19:30", "weekdays": [1,2,3,4,5,6,7]}]}
      """
    Then the response status is 201
    And the response JSON list "created" has 14 entries
    And there are 14 Meal Slots
    And every Meal Slot is attended by 2 Members

  Scenario: An empty name is refused and nothing is created
    When I POST "/api/meal-slots/batch" with JSON:
      """
      {"slots": [{"name": "Lunch", "time": "13:00", "weekdays": [1,2]}, {"name": " ", "time": "19:30", "weekdays": [1]}]}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And there are 0 Meal Slots

  Scenario: A name that is already a Meal Slot on that weekday is refused whole
    Given the Admin adds the Meal Slot "Dinner" on Tuesday at 20:00 without naming who attends
    When I POST "/api/meal-slots/batch" with JSON:
      """
      {"slots": [{"name": "Lunch", "time": "13:00", "weekdays": [1,2,3]}, {"name": "Dinner", "time": "19:30", "weekdays": [2]}]}
      """
    Then the response status is 409
    And the error code is "duplicate_slot"
    And there are 1 Meal Slots

  Scenario: A name freed by removing a Meal Slot can be used again
    Given the Admin adds the Meal Slot "Lunch" on Monday at 12:00 without naming who attends
    And the Admin removes the Meal Slot "Lunch" on Monday
    When I POST "/api/meal-slots/batch" with JSON:
      """
      {"slots": [{"name": "Lunch", "time": "13:00", "weekdays": [1]}]}
      """
    Then the response status is 201
    And there are 1 Meal Slots

  Scenario: A User cannot create Meal Slots
    Given I am signed in as the User
    When I POST "/api/meal-slots/batch" with JSON:
      """
      {"slots": [{"name": "Lunch", "time": "13:00", "weekdays": [1]}]}
      """
    Then the response status is 403

  Scenario: Hiding the checklist is kept, and a later save that leaves it out keeps it hidden
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "Europe/Rome", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "EUR", "setupHidden": true}
      """
    Then the response JSON field "setupHidden" is true
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "Europe/Rome", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "EUR"}
      """
    Then the response JSON field "setupHidden" is true
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "Europe/Rome", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "EUR", "setupHidden": false}
      """
    Then the response JSON field "setupHidden" is false

  Scenario: The current User learns the Household's time zone
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "Europe/Rome", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "EUR"}
      """
    And I am signed in as the User
    And I GET "/api/me"
    Then the response JSON field "householdTimeZone" is "Europe/Rome"
