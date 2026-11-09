Feature: Members
  A Member is a person who eats from the plan. Each has a default Portion
  Factor from 0.25 to 3 in steps of 0.25. A Member may be linked to a User.

  Scenario: The Admin adds a Member
    Given a running Feeder
    And I am signed in as the Admin
    When I POST "/api/members" with JSON:
      """
      {"name": "Sam", "colour": "#e07a5f", "avatar": "🦊", "portionFactor": 0.5}
      """
    Then the response status is 201
    And the response JSON field "name" is "Sam"
    And the response JSON field "portionFactor" is "0.5"

  Scenario Outline: Portion Factor goes from 0.25 to 3 in steps of 0.25
    Given a running Feeder
    And I am signed in as the Admin
    When I POST "/api/members" with JSON:
      """
      {"name": "Test", "colour": "#3366cc", "portionFactor": <factor>}
      """
    Then the response status is <status>

    Examples:
      | factor | status |
      | 0.25   | 201    |
      | 1      | 201    |
      | 2.75   | 201    |
      | 3      | 201    |
      | 0      | 422    |
      | 0.3    | 422    |
      | 3.25   | 422    |
      | -1     | 422    |

  Scenario: A plain User cannot add Members but can see them
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And I am signed in as the User
    When I GET "/api/members"
    Then the response status is 200
    When I POST "/api/members" with JSON:
      """
      {"name": "Sam", "colour": "#e07a5f", "portionFactor": 0.5}
      """
    Then the response status is 403

  Scenario: A Member can be linked to one User only
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Marco" with Portion Factor 1
    And I am signed in as the Admin
    When I link the Member "Anna" to the User "user@example.test"
    Then the response status is 200
    When I link the Member "Marco" to the User "user@example.test"
    Then the response status is 409
    And the error code is "user_already_linked"

  Scenario: Removing a User keeps their Member
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And I am signed in as the Admin
    And I link the Member "Anna" to the User "user@example.test"
    When the User "user@example.test" is removed from the allowlist
    And I GET "/api/members"
    Then the response status is 200
    And the Member "Anna" is not linked to any User
