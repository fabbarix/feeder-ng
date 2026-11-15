@b9 @area-household
Feature: A long Recipe can be started the evening before
  Beside the Earliest start the Household has a Latest start, 22:00 until an Admin changes it or turns it Off. The
  planner may pick a Recipe whose cooking starts on an earlier day than the meal, as long as the start is between the
  Earliest start and the Latest start. With the Latest start Off, a start must be on the day of the meal, at or after
  the Earliest start. A Planned Meal that has to be started on an earlier day says when. Today is Monday 2026-11-09,
  12:00, and the Household's time zone is UTC.

  Scenario: A new Household starts with a Latest start of 22:00
    Given a running Feeder
    And I am signed in as the User
    When I GET "/api/household/settings"
    Then the response status is 200
    And the response JSON field "latestStart" is "22:00"
    And the response JSON field "earliestStart" is "06:30"

  Scenario: The Admin changes the Latest start, and a save that leaves it out keeps it
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "latestStart": "21:30"}
      """
    Then the response status is 200
    And the response JSON field "latestStart" is "21:30"
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD"}
      """
    Then the response JSON field "latestStart" is "21:30"

  Scenario: The Admin turns the Latest start Off
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "latestStart": null}
      """
    Then the response status is 200
    And the response JSON field "latestStart" is null

  Scenario: A Latest start that is not later than the Earliest start is refused
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD",
       "earliestStart": "07:00", "latestStart": "07:00"}
      """
    Then the response status is 422
    And the error code is "validation_failed"

  Scenario: A User cannot change the Latest start
    Given a running Feeder
    And I am signed in as the User
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "latestStart": "21:00"}
      """
    Then the response status is 403

  Scenario: A 10 hour Recipe is planned for an early Breakfast and started the evening before
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Admin adds the Meal Slot "Breakfast" on Tuesday at 07:00 without naming who attends
    And the planning household plans 3 days ahead
    And the planning Recipe "Slow stew" takes 10 hours to cook
    And I am signed in as the User
    And the planner has finished
    When I view the plan
    Then the plan slot on 2026-11-10 has the Recipe "Slow stew"
    And the plan slot on 2026-11-10 starts cooking on 2026-11-09 at "21:00"

  Scenario: A start exactly at the Latest start is allowed
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Admin adds the Meal Slot "Breakfast" on Tuesday at 07:00 without naming who attends
    And the planning household plans 3 days ahead
    And the planning Recipe "Slow stew" takes 9 hours to cook
    And I am signed in as the User
    And the planner has finished
    When I view the plan
    Then the plan slot on 2026-11-10 has the Recipe "Slow stew"
    And the plan slot on 2026-11-10 starts cooking on 2026-11-09 at "22:00"

  Scenario: A Recipe that would have to start after the Latest start is not planned
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Admin adds the Meal Slot "Breakfast" on Tuesday at 07:00 without naming who attends
    And the planning household plans 3 days ahead
    And the planning Recipe "Slow stew" takes 8 hours to cook
    And I am signed in as the User
    And the planner has finished
    When I view the plan
    Then the plan slot on 2026-11-10 could not be planned because "no_candidates"
    And the plan slot on 2026-11-10 lost 1 Recipe to the Earliest start

  Scenario: A Recipe that starts on the day of the meal says nothing about an earlier day
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Admin adds the Meal Slot "Breakfast" on Tuesday at 12:00 without naming who attends
    And the planning household plans 3 days ahead
    And the planning Recipe "Slow stew" takes 4 hours to cook
    And I am signed in as the User
    And the planner has finished
    When I view the plan
    Then the plan slot on 2026-11-10 has the Recipe "Slow stew"
    And the plan slot on 2026-11-10 has no earlier start day

  Scenario: Turning the Latest start Off stops the planner starting a Recipe the evening before
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Admin adds the Meal Slot "Breakfast" on Tuesday at 07:00 without naming who attends
    And the planning household plans 3 days ahead
    And the planning Recipe "Slow stew" takes 10 hours to cook
    And I am signed in as the Admin
    And the planner has finished
    When I view the plan
    Then the plan slot on 2026-11-10 has the Recipe "Slow stew"
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 3, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "latestStart": null}
      """
    And the planner has finished
    And I view the plan
    Then the plan slot on 2026-11-10 could not be planned because "no_candidates"
    And the plan slot on 2026-11-10 lost 1 Recipe to the Earliest start
