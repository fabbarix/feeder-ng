Feature: Ready Meals in Import Review
  Import Review applies the same Ready Meal rule as the Recipe editor: a Ready Meal whose one line is named like
  the Recipe needs no Ingredient definition. An Ingredient with that name is used, otherwise a piece Ingredient is
  created. A file that names its line differently is still handled exactly as before.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: Ready Meal creates its Ingredient on import
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "recipes": [{"name": "Lasagne pack", "yield": 2, "readyMeal": true,
                    "ingredients": [{"ingredient": "lasagne pack", "quantity": 1, "unit": "piece"}]}]}
      """
    Then the response status is 201
    And the review lists the Ingredient "lasagne pack" as "new"
    And the review is ready
    When I confirm the review with no answers
    Then the response status is 200
    And the stored Ingredient "lasagne pack" has Base Unit "piece"
    And the Recipe "Lasagne pack" uses the Ingredient "lasagne pack"
    And the household has 1 Ingredients

  Scenario: Ready Meal reuses an existing Ingredient on import
    Given the household already has the Ingredient "Lasagne Pack" with Base Unit "piece"
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "recipes": [{"name": "Lasagne pack", "yield": 2, "readyMeal": true,
                    "ingredients": [{"ingredient": "lasagne pack", "quantity": 1, "unit": "piece"}]}]}
      """
    Then the review lists the Ingredient "lasagne pack" as "exact"
    When I confirm the review with no answers
    Then the response status is 200
    And the household has 1 Ingredients
    And the Recipe "Lasagne pack" uses the Ingredient "lasagne pack"

  Scenario: A Ready Meal line named differently still needs a definition
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "recipes": [{"name": "Lasagne (ready meal)", "yield": 2, "readyMeal": true,
                    "ingredients": [{"ingredient": "lasagne tray", "quantity": 1, "unit": "piece"}]}]}
      """
    Then the review lists the Ingredient "lasagne tray" as "undefined"
    And the review is not ready

  Scenario: A normal Recipe never gets a default Ingredient
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "recipes": [{"name": "Lasagne pack", "yield": 2,
                    "ingredients": [{"ingredient": "lasagne pack", "quantity": 1, "unit": "piece"}]}]}
      """
    Then the review lists the Ingredient "lasagne pack" as "undefined"
    And the review is not ready

  Scenario: Quick create and Import Review find the same near duplicate
    Given the Household has the Ingredient "chicken thigh" with Base Unit g
    When I search Ingredients for "chicken thighs"
    Then the first search suggestion is "chicken thigh"
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "ingredients": [{"name": "chicken thighs", "baseUnit": "g"}],
       "recipes": [{"name": "Grill", "yield": 2,
                    "ingredients": [{"ingredient": "chicken thighs", "quantity": 400, "unit": "g"}]}]}
      """
    Then the review lists the Ingredient "chicken thighs" as "suggested"
    And the first suggestion for "chicken thighs" is "chicken thigh"
