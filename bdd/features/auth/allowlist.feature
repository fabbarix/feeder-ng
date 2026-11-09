Feature: Allowlist management
  The Admin decides who may sign in. Removing a User ends their sessions at
  once, and the last Admin can never be removed.

  Scenario: The Admin adds someone to the allowlist
    Given a running Feeder
    And I am signed in as the Admin
    When I POST "/api/allowlist" with JSON:
      """
      {"email": "Nonna@Example.test"}
      """
    Then the response status is 201
    And the response JSON field "email" is "nonna@example.test"
    And the allowlist has an entry for "nonna@example.test"

  Scenario: Adding the same email twice is refused
    Given a running Feeder
    And I am signed in as the Admin
    When I POST "/api/allowlist" with JSON:
      """
      {"email": "user@example.test"}
      """
    Then the response status is 409
    And the error code is "email_taken"

  Scenario: A plain User cannot see or change the allowlist
    Given a running Feeder
    And I am signed in as the User
    When I GET "/api/allowlist"
    Then the response status is 403
    And the error code is "forbidden"
    When I POST "/api/allowlist" with JSON:
      """
      {"email": "friend@example.test"}
      """
    Then the response status is 403

  Scenario: Removing a User signs them out immediately
    Given a running Feeder
    And "cook@example.test" is on the allowlist
    And I am signed in as "cook@example.test"
    And I am signed in as the Admin
    When the Admin removes "cook@example.test" from the allowlist through the API
    Then the response status is 204
    When I am signed in as "cook@example.test"
    And I GET "/api/me"
    Then the response status is 401

  Scenario: The last Admin cannot be removed
    Given a running Feeder
    And I am signed in as the Admin
    When the Admin removes "admin@example.test" from the allowlist through the API
    Then the response status is 409
    And the error code is "last_admin"
    And there is exactly 1 Admin

  Scenario: The last Admin cannot be demoted
    Given a running Feeder
    And I am signed in as the Admin
    When the Admin sets Admin to false for "admin@example.test" through the API
    Then the response status is 409
    And the error code is "last_admin"

  Scenario: Promoting a second Admin lets the first step down
    Given a running Feeder
    And I am signed in as the Admin
    When the Admin sets Admin to true for "user@example.test" through the API
    Then the response status is 200
    And there are exactly 2 Admins
    When the Admin sets Admin to false for "admin@example.test" through the API
    Then the response status is 200
    And there is exactly 1 Admin
    And "user@example.test" is an Admin

  Scenario: Removing a User through the allowlist closes their live-update stream
    Given a running Feeder
    And "cook@example.test" is on the allowlist
    And I am signed in as "cook@example.test"
    And a live-update stream is open
    And I am signed in as the Admin
    When the Admin removes "cook@example.test" from the allowlist through the API
    Then the response status is 204
    And the live-update stream is closed without further events

  Scenario: Two Admins cannot remove each other
    Given a running Feeder
    And I am signed in as the Admin
    When the Admin sets Admin to true for "user@example.test" through the API
    And the Admin removes "user@example.test" from the allowlist through the API
    Then the response status is 204
    When the Admin removes "admin@example.test" from the allowlist through the API
    Then the response status is 409
    And the error code is "last_admin"
    And there is exactly 1 Admin
