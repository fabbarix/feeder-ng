Feature: Cross-site write protection
  State-changing API requests must be JSON, and a browser request from
  another origin is refused, so another website cannot act as a signed-in User.

  Scenario: A write from another origin is refused
    Given a running Feeder
    And I am signed in as the Admin
    When I POST "/api/allowlist" with the header "Origin" set to "https://evil.example" and JSON:
      """
      {"email": "mallory@example.test"}
      """
    Then the response status is 403
    And the error code is "cross_origin"
    And the allowlist has no entry for "mallory@example.test"

  Scenario: A write with a form content type is refused
    Given a running Feeder
    And I am signed in as the Admin
    When I POST "/api/allowlist" with the header "Content-Type" set to "text/plain" and JSON:
      """
      {"email": "mallory@example.test"}
      """
    Then the response status is 415
    And the error code is "unsupported_media_type"
    And the allowlist has no entry for "mallory@example.test"

  Scenario: A write from the Feeder's own origin works
    Given a running Feeder
    And I am signed in as the Admin
    When I POST "/api/allowlist" with the header "Origin" set to "{origin}" and JSON:
      """
      {"email": "nonna@example.test"}
      """
    Then the response status is 201
