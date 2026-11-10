Feature: Reading a recipe from a page or from text
  A User gives a web page address or pasted text. The server fetches and prepares the source, a model turns it into a
  Recipe File, and the result opens a normal Import Review. Nothing is saved until the User confirms.

  Background:
    Given a running Feeder with a secret key
    And a fake Anthropic server
    And the Recipe Assistant is on with the fake server and the API key "sk-ant-api03-READ00001"
    And I am signed in as the User

  Scenario: Text opens the review and nothing is saved until Confirm
    When I read the recipe text "Chicken tikka traybake #fake:valid"
    Then the read is done and a review is open
    And 0 Recipes exist
    When I confirm the review
    Then 2 Recipes exist

  Scenario: A page with recipe data sends it as a hint with the page text
    Given a recipe page "/tikka" with recipe data
    When I read the page "/tikka"
    Then the read is done and a review is open
    And the model was given structured data before the page text
    And the read says the page's recipe data was used

  Scenario: A page without recipe data sends the page text only
    Given a recipe page "/plain" without recipe data
    When I read the page "/plain"
    Then the read is done and a review is open
    And the model was given the page text only

  Scenario: An image that is not in the source is dropped and injected instructions change nothing
    When I read the recipe text "something #fake:injection"
    Then the read is done and a review is open
    When I confirm the review
    Then no Recipe has an image or a source address

  Scenario: One repair turn
    When I read the recipe text "x #fake:invalid-then-valid"
    Then the read is done and a review is open
    And the model was called 2 times

  Scenario: Still invalid after the repair
    When I read the recipe text "x #fake:invalid"
    Then the read failed with "assistant_invalid_output"
    And the model was called 2 times

  Scenario: No recipe in the source
    When I read the recipe text "hello #fake:no-recipe"
    Then the read failed with "no_recipe_found"

  Scenario: A refusal is shown as such and no other model is tried
    When I read the recipe text "x #fake:refusal"
    Then the read failed with "assistant_declined"
    And the model was called 1 times
    And every call used the model "claude-haiku-5-5"

  Scenario Outline: Anthropic errors map to Feeder codes
    When I read the recipe text "x #fake:<marker>"
    Then the read failed with "<code>"

    Examples:
      | marker     | code                         |
      | 401        | assistant_bad_key            |
      | 403        | assistant_forbidden          |
      | 404-model  | assistant_model_unavailable  |
      | 529        | assistant_busy               |
      | max-tokens | assistant_output_too_long    |

  Scenario: A rate-limited Anthropic answer waiting longer than the budget stops at once
    Given the fake server asks to retry after 600 seconds
    When I read the recipe text "x #fake:429"
    Then the read failed with "assistant_rate_limited" after 600 seconds

  Scenario: The Recipe Assistant is off
    Given the Recipe Assistant is turned off
    When I start a read of the text "anything"
    Then the response status is 503
    And the error code is "assistant_off"

  Scenario: Only one read at a time, Admins included
    Given the fake server answers slowly
    When I start a read of the text "slow one #fake:slow"
    And I start a read of the text "second"
    Then the response status is 409
    And the error code is "read_in_progress"
    When I am signed in as the Admin
    And I start a read of the text "admin slow #fake:slow"
    And I start a read of the text "admin second"
    Then the response status is 409

  Scenario: Cancel stops the call
    Given the fake server answers slowly
    When I start a read of the text "slow one #fake:slow"
    And I cancel the read
    Then the read ends as cancelled
    When I read the recipe text "after the cancel #fake:valid"
    Then the read is done and a review is open

  Scenario: The 31st read in an hour is refused for a User but an Admin can still read
    Given I have read 30 recipes
    When I start a read of the text "one too many"
    Then the response status is 429
    And the error code is "too_many_reads"
    When I am signed in as the Admin
    And I read the recipe text "admin read #fake:valid"
    Then the read is done and a review is open
    When I am signed in as the User
    And I read the Recipe Assistant status
    Then the response JSON field "limit.remaining" is "0"
