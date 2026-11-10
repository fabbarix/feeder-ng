Feature: Recipe Assistant models and connection test
  The model list comes from the Anthropic Models API (filtered to models that can produce structured output) with a
  curated catalogue as fallback. The saved key is only ever sent to the saved origin, on every route.

  Background:
    Given a running Feeder with a secret key
    And a fake Anthropic server
    And the Recipe Assistant is on with the fake server and the API key "sk-ant-api03-SAVED0001"

  Scenario: The list comes from the fake and Haiku 5.5 is first
    When an Admin lists the models
    Then the response status is 200
    And the response JSON field "source" is "api"
    And the first model is "claude-haiku-5-5"
    And the list does not offer "claude-opus-4-6"

  Scenario: A gateway without a models endpoint falls back to the catalogue
    Given the fake server has no models endpoint
    When an Admin lists the models
    Then the response JSON field "source" is "catalogue"
    And the first model is "claude-haiku-5-5"

  Scenario: A saved model that the API no longer lists makes the assistant unavailable
    Given the fake server no longer lists the saved model
    When I am signed in as the User
    And I read the Recipe Assistant status
    Then the response JSON field "reason" is "model_unavailable"

  Scenario: Test connection reports each check
    When an Admin tests the connection
    Then the response status is 200
    And the response JSON field "ok" is true
    And the connection checks passed are "key, model, output"

  Scenario: Test connection with a model that does not exist
    When an Admin tests the connection for the model "claude-gone-9"
    Then the response JSON field "ok" is false

  Scenario Outline: The saved key is only sent to the saved origin
    Given a second fake Anthropic server
    When an Admin calls <method> <route> with base URL "<other>" and no API key
    Then the answer is 422 "key_required_for_new_base_url"
    And the second server received no request
    When an Admin calls <method> <route> with base URL "<other>" and API key "sk-new"
    Then the second server received "sk-new" as x-api-key and never "sk-ant-api03-SAVED0001"

    Examples:
      | method | route                              | other                    |
      | POST   | /api/recipe-assistant/models       | {second}                 |
      | POST   | /api/recipe-assistant/test         | {second:localhost}       |
      | PUT    | /api/recipe-assistant/settings     | {second:localhost}       |
      | POST   | /api/recipe-assistant/models       | {fake:localhost}         |
      | POST   | /api/recipe-assistant/test         | {fake:https}             |
