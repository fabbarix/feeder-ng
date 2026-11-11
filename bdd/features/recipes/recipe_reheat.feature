Feature: A Recipe's reheat time
  A Recipe may carry an optional reheat time in whole minutes (1 to 30). Reheat uses it as the default
  timer for a Leftover of that Recipe; without it Reheat falls back to its formula. Blank means "not set".

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Ingredient "flour" exists with Base Unit "g"

  Scenario: A Recipe without a reheat time has none
    When I create a Recipe with JSON:
      """
      {"name": "Pancakes", "yield": 4, "lines": [{"ingredientId": <id:flour>, "quantity": 250, "unit": "g"}]}
      """
    Then the response status is 201
    And the Recipe JSON "reheatMinutes" is "<nil>"

  Scenario: Saving and reading a reheat time
    When I create a Recipe with JSON:
      """
      {"name": "Pancakes", "yield": 4, "reheatMinutes": 5, "lines": [{"ingredientId": <id:flour>, "quantity": 250, "unit": "g"}]}
      """
    Then the response status is 201
    And the Recipe JSON "reheatMinutes" is "5"
    When I open the Recipe "Pancakes"
    Then the Recipe JSON "reheatMinutes" is "5"

  Scenario: Replacing a Recipe can change or clear the reheat time
    Given I create a Recipe with JSON:
      """
      {"name": "Pancakes", "yield": 4, "reheatMinutes": 5, "lines": [{"ingredientId": <id:flour>, "quantity": 250, "unit": "g"}]}
      """
    When I replace the Recipe "Pancakes" with JSON:
      """
      {"name": "Pancakes", "yield": 4, "reheatMinutes": 30, "lines": [{"ingredientId": <id:flour>, "quantity": 250, "unit": "g"}]}
      """
    Then the Recipe JSON "reheatMinutes" is "30"
    When I replace the Recipe "Pancakes" with JSON:
      """
      {"name": "Pancakes", "yield": 4, "reheatMinutes": null, "lines": [{"ingredientId": <id:flour>, "quantity": 250, "unit": "g"}]}
      """
    Then the Recipe JSON "reheatMinutes" is "<nil>"

  Scenario Outline: A reheat time outside 1 to 30 minutes is refused
    When I create a Recipe with JSON:
      """
      {"name": "Pancakes", "yield": 4, "reheatMinutes": <minutes>, "lines": [{"ingredientId": <id:flour>, "quantity": 250, "unit": "g"}]}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the response JSON field "error.reason" is "reheat_invalid"
    And the response JSON field "error.field" is "reheatMinutes"

    Examples:
      | minutes |
      | 0       |
      | -1      |
      | 31      |
