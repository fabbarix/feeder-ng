Feature: Google sign-in
  People sign in with Google only. Someone whose verified Google email is not
  on the allowlist gets no session: they ask for access instead (see
  access_requests.feature). An unverified Google email is refused outright.
  The redirect URI is <FEEDER_BASE_URL>/auth/google/callback.

  Scenario: An allowlisted Google email signs in
    Given a running Feeder with Google sign-in
    And Google knows "user@example.test" as "Una User"
    When I start Google sign-in
    Then the browser is sent to Google asking to come back to "https://feeder.example/auth/google/callback"
    When Google sends me back with the code
    Then the sign-in redirect goes to "/"
    And I have a Feeder session
    When I GET "/api/me"
    Then the response status is 200
    And the response JSON field "email" is "user@example.test"

  Scenario: The sign-in uses PKCE
    Given a running Feeder with Google sign-in
    And Google knows "user@example.test" as "Una User"
    When I start Google sign-in
    And Google sends me back with the code
    Then Google received the PKCE verifier belonging to my sign-in

  Scenario: Email case does not matter
    Given a running Feeder with Google sign-in
    And Google knows "USER@Example.TEST" as "Una User"
    When I start Google sign-in
    And Google sends me back with the code
    Then the sign-in redirect goes to "/"
    And I have a Feeder session

  Scenario: A Google email that is not on the allowlist waits for approval
    Given a running Feeder with Google sign-in
    And Google knows "stranger@example.test" as "Stranger"
    When I start Google sign-in
    And Google sends me back with the code
    Then the sign-in redirect goes to "/waiting-for-approval"
    And I have no Feeder session
    When I GET "/api/me"
    Then the response status is 401

  Scenario: A stranger is not added to the allowlist by trying
    Given a running Feeder with Google sign-in
    And Google knows "stranger@example.test" as "Stranger"
    When I start Google sign-in
    And Google sends me back with the code
    Then the allowlist has no entry for "stranger@example.test"

  Scenario: A Google email that is not verified is refused as not verified
    Given a running Feeder with Google sign-in
    And Google knows "user@example.test" but has not verified it
    When I start Google sign-in
    And Google sends me back with the code
    Then the sign-in redirect goes to "/email-not-verified"
    And I have no Feeder session

  Scenario: A forged state is refused
    Given a running Feeder with Google sign-in
    And Google knows "user@example.test" as "Una User"
    When I start Google sign-in
    And Google sends me back with a forged state
    Then the sign-in redirect goes to "/sign-in?error=failed"
    And I have no Feeder session

  Scenario: Declining on Google's consent screen
    Given a running Feeder with Google sign-in
    When I start Google sign-in
    And I decline on Google's consent screen
    Then the sign-in redirect goes to "/sign-in?error=denied"
    And I have no Feeder session

  Scenario: A User removed from the allowlist can no longer sign in
    Given a running Feeder with Google sign-in
    And "cook@example.test" is on the allowlist
    And Google knows "cook@example.test" as "Cook"
    When the User "cook@example.test" is removed from the allowlist
    And I start Google sign-in
    And Google sends me back with the code
    Then the sign-in redirect goes to "/waiting-for-approval"
    And I have no Feeder session

  Scenario: Sign-in is unavailable until Google credentials are configured
    Given a running Feeder
    When I GET "/auth/google/login"
    Then the response status is 503
    And the error code is "google_not_configured"
