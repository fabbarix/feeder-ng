Feature: Published Recipe File schema and Agent Prompt
  The running app serves the Recipe File schema, and "Copy Agent Prompt" copies the
  template with the schema and an example inlined.

  Background:
    Given a running Feeder

  Scenario: The schema is public
    Given I am not signed in
    When I GET "/schema/recipe-file-v1.json"
    Then the response status is 200
    And the response JSON field "title" is "Feeder Recipe File v1"
    And the response JSON field "$schema" is "https://json-schema.org/draft/2020-12/schema"

  Scenario: The Agent Prompt needs a signed-in User
    Given I am not signed in
    When I GET "/api/recipe-file/agent-prompt"
    Then the response status is 401

  Scenario: The Agent Prompt has the schema and the example inlined
    Given I am signed in as the User
    When I GET "/api/recipe-file/agent-prompt"
    Then the response status is 200
    And the Agent Prompt starts with "You convert recipes into a Feeder Recipe File"
    And the Agent Prompt contains the schema and the example
    And the Agent Prompt has no template placeholders left

  Scenario: The Agent Prompt asks for the optional reheat time
    Given I am signed in as the User
    When I GET "/api/recipe-file/agent-prompt"
    Then the Agent Prompt mentions "reheatMinutes" at least 3 times
