Feature: Sessions
  A User stays signed in with a 30-day sliding session cookie. Signing out,
  or being removed from the allowlist, ends the session at once.

  Scenario: Without a session the API says who you are not
    Given a running Feeder
    And I am not signed in
    When I GET "/api/me"
    Then the response status is 401
    And the error code is "unauthenticated"

  Scenario: A signed-in User sees their own details
    Given a running Feeder
    And I am signed in as the User
    When I GET "/api/me"
    Then the response status is 200
    And the response JSON field "email" is "user@example.test"

  Scenario: Signing out ends the session
    Given a running Feeder
    And I am signed in as the User
    When I POST "/api/logout"
    Then the response status is 204
    When I GET "/api/me"
    Then the response status is 401

  Scenario: A removed User is signed out immediately
    Given a running Feeder
    And "cook@example.test" is on the allowlist
    And I am signed in as "cook@example.test"
    When I GET "/api/me"
    Then the response status is 200
    When the User "cook@example.test" is removed from the allowlist
    And I GET "/api/me"
    Then the response status is 401

  Scenario: Other Users stay signed in when someone is removed
    Given a running Feeder
    And "cook@example.test" is on the allowlist
    And I am signed in as "cook@example.test"
    And I am signed in as the User
    When the User "cook@example.test" is removed from the allowlist
    And I GET "/api/me"
    Then the response status is 200

  Scenario: Using the app keeps the session alive past 30 days in total
    Given a running Feeder
    And I am signed in as the User
    When 20 days pass
    And I GET "/api/me"
    And 20 days pass
    And I GET "/api/me"
    Then the response status is 200

  Scenario: A session unused for 30 days ends
    Given a running Feeder
    And I am signed in as the User
    When 31 days pass
    And I GET "/api/me"
    Then the response status is 401

  Scenario: A session survives a restart
    Given a running Feeder
    And I am signed in as the User
    When the Feeder is restarted
    And I GET "/api/me"
    Then the response status is 200

  Scenario: Removing a User closes their open live-update stream
    Given a running Feeder
    And "cook@example.test" is on the allowlist
    And I am signed in as "cook@example.test"
    And a live-update stream is open
    When the User "cook@example.test" is removed from the allowlist
    Then the live-update stream is closed without further events

  Scenario: Signing out closes the live-update stream
    Given a running Feeder
    And I am signed in as the User
    And a live-update stream is open
    When I POST "/api/logout"
    Then the live-update stream is closed without further events
