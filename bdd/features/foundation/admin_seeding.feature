Feature: First Admin seeding
  FEEDER_ADMIN_EMAIL puts the first Admin on the allowlist when the
  Feeder starts, so someone can always sign in.

  Scenario: The configured email becomes the first Admin
    Given a running Feeder with FEEDER_ADMIN_EMAIL "Boss@Example.test"
    Then "boss@example.test" is an Admin
    And there is exactly 1 Admin

  Scenario: The seeded Admin can sign in and sees Admin rights
    Given a running Feeder with FEEDER_ADMIN_EMAIL "boss@example.test"
    And I am signed in as "boss@example.test"
    When I GET "/api/me"
    Then the response status is 200
    And the response JSON field "email" is "boss@example.test"
    And the response JSON field "isAdmin" is true

  Scenario: Restarting does not create a second Admin
    Given a running Feeder with FEEDER_ADMIN_EMAIL "boss@example.test"
    When the Feeder is restarted
    And the Feeder is restarted
    Then there is exactly 1 Admin

  Scenario: A User who is not an Admin has no Admin rights
    Given a running Feeder
    And I am signed in as the User
    When I GET "/api/me"
    Then the response JSON field "isAdmin" is false
