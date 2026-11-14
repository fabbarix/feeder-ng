@b9
Feature: The plan never asks me to start cooking before my earliest start
  The Household has an Earliest start, 06:30 until an Admin changes it or turns it Off. The planner does not plan a
  Recipe in a Meal Slot when cooking would have to start before it. Advance Steps the day before are not affected,
  and a Pinned meal is only flagged, never refused. Today is Monday 2026-11-09, 12:00.

  Scenario: A new Household starts with an Earliest start of 06:30
    Given a running Feeder
    And I am signed in as the User
    When I GET "/api/household/settings"
    Then the response status is 200
    And the response JSON field "earliestStart" is "06:30"
    And the response JSON field "setupHidden" is false

  Scenario: The Admin changes the Earliest start, and a save that leaves it out keeps it
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "earliestStart": "07:15"}
      """
    Then the response status is 200
    And the response JSON field "earliestStart" is "07:15"
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD"}
      """
    Then the response JSON field "earliestStart" is "07:15"

  Scenario: The Admin turns the Earliest start Off
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "earliestStart": null}
      """
    Then the response status is 200
    And the response JSON field "earliestStart" is null

  Scenario: An Earliest start that is not a time of day is refused
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "earliestStart": "6:30"}
      """
    Then the response status is 422
    And the error code is "validation_failed"

  Scenario: A User cannot change the Earliest start
    Given a running Feeder
    And I am signed in as the User
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "earliestStart": "09:00"}
      """
    Then the response status is 403

  Scenario: A 6 hour Recipe is not planned for an early Breakfast
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Admin adds the Meal Slot "Breakfast" on Tuesday at 08:30 without naming who attends
    And the planning household plans 3 days ahead
    And the planning Recipe "Slow stew" takes 6 hours to cook
    And I am signed in as the User
    And the planner has finished
    When I view the plan
    Then the plan slot on 2026-11-10 could not be planned because "no_candidates"
    And the plan slot on 2026-11-10 lost 1 Recipe to the Earliest start

  Scenario: Turning the Earliest start Off lets the planner plan it again
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Admin adds the Meal Slot "Breakfast" on Tuesday at 08:30 without naming who attends
    And the planning household plans 3 days ahead
    And the planning Recipe "Slow stew" takes 6 hours to cook
    And I am signed in as the Admin
    And the planner has finished
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 3, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "earliestStart": null}
      """
    And the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-10 has the Recipe "Slow stew"
