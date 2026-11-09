Feature: Household settings
  Only the Admin edits the Household's settings; every User reads them.

  Scenario: A new Household starts with the specified defaults
    Given a running Feeder
    And I am signed in as the User
    When I GET "/api/household/settings"
    Then the response status is 200
    And the response JSON field "planningHorizonDays" is "7"
    And the response JSON field "defaultCooldownDays" is "7"
    And the response JSON field "defaultLeftoverUseByDays" is "3"
    And the response JSON field "quietHours.start" is "22:00"
    And the response JSON field "quietHours.end" is "07:00"
    And the response JSON field "plannerStyle" is "0.5"
    And the response JSON field "currency" is "USD"
    And the response JSON field "timeZoneConfigured" is false

  Scenario: The Admin sets up the Household
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "Europe/Rome", "planningHorizonDays": 14, "defaultCooldownDays": 10,
       "defaultLeftoverUseByDays": 2, "quietHours": {"start": "23:00", "end": "06:30"},
       "plannerStyle": 0.25, "location": {"city": "Turin"}, "currency": "eur"}
      """
    Then the response status is 200
    And the response JSON field "timeZone" is "Europe/Rome"
    And the response JSON field "timeZoneConfigured" is true
    And the response JSON field "currency" is "EUR"
    And the response JSON field "location.city" is "Turin"
    When the Feeder is restarted
    And I GET "/api/household/settings"
    Then the response JSON field "planningHorizonDays" is "14"
    And the response JSON field "plannerStyle" is "0.25"

  Scenario: A plain User cannot change the settings
    Given a running Feeder
    And I am signed in as the User
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD"}
      """
    Then the response status is 403

  Scenario Outline: Planning Horizon is between 1 and 28 days
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": <days>, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD"}
      """
    Then the response status is <status>

    Examples:
      | days | status |
      | 0    | 422    |
      | 1    | 200    |
      | 28   | 200    |
      | 29   | 422    |

  Scenario Outline: Planner Style is a position between 0 and 1
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": <position>, "currency": "USD"}
      """
    Then the response status is <status>

    Examples:
      | position | status |
      | 0        | 200    |
      | 0.5      | 200    |
      | 0.8      | 200    |
      | 1        | 200    |
      | 1.2      | 422    |
      | -0.1     | 422    |

  Scenario: The Location may be coordinates and may be cleared
    Given a running Feeder
    And I am signed in as the Admin
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD",
       "location": {"latitude": 45.07, "longitude": 7.69}}
      """
    Then the response JSON field "location.latitude" is "45.07"
    When I PUT "/api/household/settings" with JSON:
      """
      {"timeZone": "UTC", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "USD", "location": null}
      """
    Then the response status is 200
