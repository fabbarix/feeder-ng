Feature: Recipe Assistant settings
  Admins turn the Recipe Assistant on, give it a base URL, a model and an API key. The key is encrypted under the
  server's secret key, never shown again, and bound to the address it was saved for.

  Background:
    Given a fake Anthropic server

  Scenario: Without FEEDER_SECRET_KEY the Recipe Assistant cannot be turned on
    Given a running Feeder without a secret key
    And I am signed in as the Admin
    When I save the Recipe Assistant settings as on, with the fake server, model "claude-haiku-5-5" and API key "sk-ant-api03-ZZZZ1111"
    Then the response status is 422
    And the answer is 422 "secret_key_missing"
    When I am signed in as the User
    And I read the Recipe Assistant status
    Then the response JSON field "available" is false
    And the response JSON field "reason" is "no_secret_key"

  Scenario: An Admin turns it on and the key is never shown again
    Given a running Feeder with a secret key
    And I am signed in as the Admin
    When I save the Recipe Assistant settings as on, with the fake server, model "claude-sonnet-5-5" and API key "sk-ant-api03-ZZZZ1111"
    Then the response status is 200
    When I read the Recipe Assistant settings
    Then the response JSON field "hasApiKey" is true
    And the response JSON field "apiKeyLast4" is "1111"
    And the response JSON field "model" is "claude-sonnet-5-5"
    And no response so far contains "ZZZZ1111"

  Scenario: An empty key keeps the saved key
    Given a running Feeder with a secret key
    And the Recipe Assistant is on with the fake server and the API key "sk-ant-api03-ZZZZ1111"
    When I save the Recipe Assistant settings as on, with the fake server and model "claude-opus-5-5" and no API key
    Then the response status is 200
    When I read the Recipe Assistant settings
    Then the response JSON field "apiKeyLast4" is "1111"
    And the response JSON field "model" is "claude-opus-5-5"

  Scenario: Remove key turns the Recipe Assistant off
    Given a running Feeder with a secret key
    And the Recipe Assistant is on with the fake server and the API key "sk-ant-api03-ZZZZ1111"
    When I remove the API key
    Then the response status is 200
    And the response JSON field "enabled" is false
    And the response JSON field "hasApiKey" is false
    When I am signed in as the User
    And I read the Recipe Assistant status
    Then the response JSON field "reason" is "off"

  Scenario Outline: Only an Admin may use the settings routes
    Given a running Feeder with a secret key
    And I am signed in as the User
    When I send <method> "<path>" with an empty JSON object
    Then the response status is 403

    Examples:
      | method | path                                       |
      | GET    | /api/recipe-assistant/settings             |
      | PUT    | /api/recipe-assistant/settings             |
      | DELETE | /api/recipe-assistant/settings/api-key     |
      | POST   | /api/recipe-assistant/models               |
      | POST   | /api/recipe-assistant/test                 |

  Scenario: A cross-origin settings change is refused
    Given a running Feeder with a secret key
    And I am signed in as the Admin
    When I send a settings change from the origin "https://evil.example"
    Then the response status is 403
    And the error code is "cross_origin"

  Scenario: Moving to another address without typing the key again changes nothing
    Given a running Feeder with a secret key
    And a second fake Anthropic server
    And the Recipe Assistant is on with the fake server and the API key "sk-ant-api03-ZZZZ1111"
    When I save the Recipe Assistant settings as on, with the second server, model "claude-haiku-5-5" and no API key
    Then the answer is 422 "key_required_for_new_base_url"
    And the second server received no request
    When I read the Recipe Assistant settings
    Then the response JSON field "baseUrl" is the fake server's address

  Scenario: Moving to another address with a new key saves it and the old key is gone
    Given a running Feeder with a secret key
    And a second fake Anthropic server
    And the Recipe Assistant is on with the fake server and the API key "sk-ant-api03-ZZZZ1111"
    When I save the Recipe Assistant settings as on, with the second server, model "claude-haiku-5-5" and API key "sk-new-key-9999"
    Then the response status is 200
    And the second server received "sk-new-key-9999" as x-api-key and never "sk-ant-api03-ZZZZ1111"
    When I read the Recipe Assistant settings
    Then the response JSON field "apiKeyLast4" is "9999"

  Scenario: A different secret key after a restart makes the saved key unreadable
    Given a running Feeder with a secret key
    And the Recipe Assistant is on with the fake server and the API key "sk-ant-api03-ZZZZ1111"
    When the server is restarted with another secret key
    And I am signed in as the Admin
    And I read the Recipe Assistant settings
    Then the response JSON field "hasApiKey" is true
    And the response JSON field "apiKeyReadable" is false
    When I am signed in as the User
    And I read the Recipe Assistant status
    Then the response JSON field "reason" is "key_unreadable"

  Scenario: Change history is recorded and only Admins see it
    Given a running Feeder with a secret key
    And the Recipe Assistant is on with the fake server and the API key "sk-ant-api03-ZZZZ1111"
    When I save the Recipe Assistant settings as on, with the fake server and model "claude-opus-5-5" and no API key
    And I read the Recipe Assistant settings
    Then the change history lists the actions "turned_on, base_url_changed, key_saved, model_changed"
    And no response so far contains "ZZZZ1111"
    When I am signed in as the User
    And I send GET "/api/recipe-assistant/settings" with an empty JSON object
    Then the response status is 403
