Feature: Health and unknown routes
  A running Feeder reports that it is healthy, and unknown API routes
  answer with the JSON error shape instead of the web app.

  Scenario: The health endpoint answers without signing in
    Given a running Feeder
    When I GET "/api/health"
    Then the response status is 200
    And the response JSON field "status" is "ok"

  Scenario: An unknown API route is a JSON 404
    Given a running Feeder
    When I GET "/api/does-not-exist"
    Then the response status is 404
    And the error code is "not_found"

  Scenario: Pages of the web app fall back to the app shell
    Given a running Feeder
    When I GET "/plan"
    Then the response status is 200
