Feature: Recipe units and Unit Conversions
  An ingredient line's unit must convert to the Ingredient's Base Unit. An
  unknown unit is answered with the details the editor needs to prompt for a
  Unit Conversion inline; once saved, the same Recipe is accepted.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Ingredient "garlic" exists with Base Unit "g"
    And the Ingredient "milk" exists with Base Unit "ml"
    And the Ingredient "flour" exists with Base Unit "g" and the Unit Conversion "cup" = 120

  Scenario: Global units and the Ingredient's own Unit Conversions are accepted
    When I create a Recipe with JSON:
      """
      {
        "name": "Sauce", "yield": 4,
        "lines": [
          {"ingredientId": <id:garlic>, "quantity": 0.5, "unit": "kg"},
          {"ingredientId": <id:milk>, "quantity": 2, "unit": "tbsp"},
          {"ingredientId": <id:flour>, "quantity": 1, "unit": "Cup"}
        ]
      }
      """
    Then the response status is 201
    And the Recipe JSON "lines.2.unit" is "cup"

  Scenario: An unknown unit asks for a Unit Conversion, then the Recipe is accepted
    When I create a Recipe with JSON:
      """
      {
        "name": "Aioli", "yield": 4,
        "lines": [
          {"ingredientId": <id:milk>, "quantity": 1, "unit": "dl"},
          {"ingredientId": <id:garlic>, "quantity": 3, "unit": "clove"}
        ]
      }
      """
    Then the response status is 422
    And the error code is "unknown_unit"
    And the Recipe JSON "error.field" is "lines[1].unit"
    And the Recipe JSON "error.ingredient" is "garlic"
    And the Recipe JSON "error.unit" is "clove"
    And the Recipe JSON "error.baseUnit" is "g"
    When I save the Unit Conversion "clove" = 5 for the Ingredient "garlic"
    And I create a Recipe with JSON:
      """
      {
        "name": "Aioli", "yield": 4,
        "lines": [
          {"ingredientId": <id:milk>, "quantity": 1, "unit": "dl"},
          {"ingredientId": <id:garlic>, "quantity": 3, "unit": "clove"}
        ]
      }
      """
    Then the response status is 201

  Scenario: Spoon measures need a conversion for a weighed Ingredient
    When I create a Recipe with JSON:
      """
      {"name": "Bake", "yield": 1, "lines": [{"ingredientId": <id:garlic>, "quantity": 1, "unit": "tbsp"}]}
      """
    Then the response status is 422
    And the error code is "unknown_unit"
    And the Recipe JSON "error.unit" is "tbsp"

  Scenario: A Step's ingredient use is checked too
    When I create a Recipe with JSON:
      """
      {
        "name": "Toast", "yield": 1,
        "lines": [{"ingredientId": <id:garlic>, "quantity": 5, "unit": "g"}],
        "steps": [{"text": "Rub", "kind": "active", "uses": [{"ingredientId": <id:garlic>, "quantity": 1, "unit": "head"}]}]
      }
      """
    Then the response status is 422
    And the error code is "unknown_unit"
    And the Recipe JSON "error.field" is "steps[0].uses[0].unit"

  Scenario: A line naming an Ingredient that does not exist is refused
    When I create a Recipe with JSON:
      """
      {"name": "Ghost", "yield": 1, "lines": [{"ingredientId": 9999, "quantity": 1, "unit": "g"}]}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the Recipe JSON "error.reason" is "unknown_ingredient"
