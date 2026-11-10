Feature: Per-User preferences
  Each User chooses light, dark or system mode, an accent colour, and metric
  (the default) or imperial display. There is no secondary colour.

  Scenario: A new User gets the defaults
    Given a running Feeder
    And I am signed in as the User
    When I GET "/api/me/preferences"
    Then the response status is 200
    And the response JSON field "scheme" is "system"
    And the response JSON field "units" is "metric"

  Scenario: Preferences belong to the User who set them
    Given a running Feeder
    And I am signed in as the User
    When I PUT "/api/me/preferences" with JSON:
      """
      {"scheme": "dark", "accent": "#3366cc", "units": "imperial"}
      """
    Then the response status is 200
    When I am signed in as the Admin
    And I GET "/api/me/preferences"
    Then the response JSON field "scheme" is "system"
    And the response JSON field "units" is "metric"
    When I am signed in as the User
    And I GET "/api/me/preferences"
    Then the response JSON field "scheme" is "dark"
    And the response JSON field "units" is "imperial"
    And the response JSON field "accent" is "#3366cc"

  Scenario: A secondary colour sent by an old client is ignored
    Given a running Feeder
    And I am signed in as the User
    When I PUT "/api/me/preferences" with JSON:
      """
      {"scheme": "light", "accent": "#3366cc", "secondary": "#ffb4a2", "units": "metric"}
      """
    Then the response status is 200
    And the response JSON has no field "secondary"
    When I GET "/api/me/preferences"
    Then the response JSON field "scheme" is "light"
    And the response JSON has no field "secondary"

  Scenario Outline: Preferences are validated
    Given a running Feeder
    And I am signed in as the User
    When I PUT "/api/me/preferences" with JSON:
      """
      {"scheme": "<scheme>", "accent": "<accent>", "units": "<units>"}
      """
    Then the response status is <status>

    Examples:
      | scheme | accent  | units    | status |
      | light  | #3f7d58 | metric   | 200    |
      | dark   | #3f7d58 | imperial | 200    |
      | system | #3f7d58 | metric   | 200    |
      | sepia  | #3f7d58 | metric   | 422    |
      | dark   | green   | metric   | 422    |
      | dark   | #3f7d58 | furlongs | 422    |

  Scenario: Preferences need a session
    Given a running Feeder
    And I am not signed in
    When I GET "/api/me/preferences"
    Then the response status is 401
