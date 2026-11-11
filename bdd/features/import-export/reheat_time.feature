Feature: The reheat time in a Recipe File
  `reheatMinutes` is an optional, backwards compatible field of Recipe File v1: files without it stay valid, and
  a Recipe's reheat time survives an export and an import.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: Exporting writes the reheat time, only for the Recipes that have one
    Given the household has the Recipe File Recipe "Curry" with a reheat time of 6 minutes, using the Ingredient "rice" in g
    And the household has the Recipe File Recipe "Porridge", using the Ingredient "oats" in g
    When I export all Recipes
    Then the response status is 200
    And the downloaded Recipe File is valid and holds the Recipes "Curry, Porridge"
    And the Recipe "Curry" in the downloaded Recipe File has a reheat time of 6 minutes
    And the Recipe "Porridge" in the downloaded Recipe File has no reheat time

  Scenario: Importing an exported file keeps the reheat time
    Given the household has the Recipe File Recipe "Curry" with a reheat time of 6 minutes, using the Ingredient "rice" in g
    When I export all Recipes
    And I review the downloaded Recipe File
    And I answer the review with:
      """
      {"decisions": {"recipes": [{"index": 0, "action": "keep_both"}]}}
      """
    And I confirm the review with the same answers
    Then the response status is 200
    And the Recipe "Curry (2)" has a reheat time of 6 minutes

  Scenario: A Recipe File without reheatMinutes still imports
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "ingredients": [{"name": "rice", "baseUnit": "g"}],
       "recipes": [{"name": "Plain rice", "yield": 2, "ingredients": [{"ingredient": "rice", "quantity": 150, "unit": "g"}]}]}
      """
    Then the response status is 201
    And the review is ready

  Scenario: A reheat time outside 1 to 30 minutes is a schema error with its path
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "ingredients": [{"name": "rice", "baseUnit": "g"}],
       "recipes": [{"name": "Plain rice", "yield": 2, "reheatMinutes": 45, "ingredients": [{"ingredient": "rice", "quantity": 150, "unit": "g"}]}]}
      """
    Then the response status is 422
    And the error code is "invalid_recipe_file"
    And the file errors include the path "$.recipes[0].reheatMinutes"
