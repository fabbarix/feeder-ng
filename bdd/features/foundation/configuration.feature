Feature: Start-up configuration
  The Feeder refuses to start without an Admin email, because nobody could
  ever sign in.

  Scenario: A missing FEEDER_ADMIN_EMAIL is refused
    Given the environment has no FEEDER_ADMIN_EMAIL
    When the configuration is loaded
    Then loading the configuration fails mentioning "FEEDER_ADMIN_EMAIL"

  Scenario: A configured Admin email is normalised
    Given the environment has FEEDER_ADMIN_EMAIL " Boss@Example.test "
    When the configuration is loaded
    Then the configured Admin email is "boss@example.test"
