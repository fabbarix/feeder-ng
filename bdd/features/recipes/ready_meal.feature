Feature: A Ready Meal and its Ingredient
  A Ready Meal is a Recipe made from exactly one Ingredient, a bought pack. Feeder keeps an Ingredient with the
  Recipe's name so the pack can be stocked and bought. Saving a Ready Meal without a line makes the line:
  1 piece of the Ingredient called like the Recipe, which is created when it does not exist yet.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: Ready Meal creates its Ingredient
    When I create a Recipe with JSON:
      """
      {"name": "Lasagne pack", "yield": 2, "readyMeal": true, "lines": []}
      """
    Then the response status is 201
    And the Recipe JSON "readyMeal" is "true"
    And the Recipe JSON "lines.0.ingredient" is "Lasagne pack"
    And the Recipe JSON "lines.0.quantity" is "1"
    And the Recipe JSON "lines.0.unit" is "piece"
    And the household has the Ingredient "Lasagne pack"
    And the stored Ingredient "Lasagne pack" has Base Unit "piece"
    And the household has 1 Ingredients

  Scenario: Ready Meal reuses an existing Ingredient
    Given the Ingredient "lasagne  PACK" exists with Base Unit "piece"
    When I create a Recipe with JSON:
      """
      {"name": "Lasagne pack", "yield": 2, "readyMeal": true, "lines": []}
      """
    Then the response status is 201
    And the Recipe JSON "lines.0.ingredientId" is "<id:lasagne  PACK>"
    And the household has 1 Ingredients

  Scenario: Ready Meal never invents a pack size for a weighed Ingredient
    Given the Ingredient "Pasta" exists with Base Unit "g"
    When I create a Recipe with JSON:
      """
      {"name": "pasta", "yield": 2, "readyMeal": true, "lines": []}
      """
    Then the response status is 422
    And the Recipe JSON "error.field" is "lines"
    And the Recipe JSON "error.reason" is "ready_meal_unit"
    And the household has 1 Ingredients

  Scenario: A Ready Meal that names its own line keeps it
    Given the Ingredient "egg" exists with Base Unit "piece"
    When I create a Recipe with JSON:
      """
      {"name": "Lasagne pack", "yield": 2, "readyMeal": true,
       "lines": [{"ingredientId": <id:egg>, "quantity": 1, "unit": "piece"}]}
      """
    Then the response status is 201
    And the Recipe JSON "lines.0.ingredient" is "egg"
    And the household has 1 Ingredients

  Scenario: A Recipe that fails validation creates no Ingredient
    When I create a Recipe with JSON:
      """
      {"name": "Lasagne pack", "yield": 0, "readyMeal": true, "lines": []}
      """
    Then the response status is 422
    And the Recipe JSON "error.field" is "yield"
    And the household has no Ingredient "Lasagne pack"

  Scenario: Replacing a Ready Meal without a line reuses the Ingredient it created
    Given I create a Recipe with JSON:
      """
      {"name": "Lasagne pack", "yield": 2, "readyMeal": true, "lines": []}
      """
    When I replace the Recipe "Lasagne pack" with JSON:
      """
      {"name": "Lasagne pack", "yield": 3, "readyMeal": true, "lines": []}
      """
    Then the response status is 200
    And the Recipe JSON "yield" is "3"
    And the household has 1 Ingredients

  Scenario: Unmarking a Ready Meal keeps its Ingredient and its line
    Given I create a Recipe with JSON:
      """
      {"name": "Lasagne pack", "yield": 2, "readyMeal": true, "lines": []}
      """
    And I remember the id of the Ingredient "Lasagne pack"
    When I replace the Recipe "Lasagne pack" with JSON:
      """
      {"name": "Lasagne pack", "yield": 2, "readyMeal": false,
       "lines": [{"ingredientId": <id:Lasagne pack>, "quantity": 1, "unit": "piece"}]}
      """
    Then the response status is 200
    And the Recipe JSON "readyMeal" is "false"
    And the Recipe JSON "lines.0.ingredient" is "Lasagne pack"
    And the household has the Ingredient "Lasagne pack"

  Scenario: Renaming the Recipe does not rename the Ingredient by itself
    Given I create a Recipe with JSON:
      """
      {"name": "Lasagne pack", "yield": 2, "readyMeal": true, "lines": []}
      """
    And I remember the id of the Ingredient "Lasagne pack"
    When I replace the Recipe "Lasagne pack" with JSON:
      """
      {"name": "Big lasagne pack", "yield": 2, "readyMeal": true,
       "lines": [{"ingredientId": <id:Lasagne pack>, "quantity": 1, "unit": "piece"}]}
      """
    Then the response status is 200
    And the Recipe JSON "lines.0.ingredient" is "Lasagne pack"
    And the household has 1 Ingredients

  Scenario: A Step cannot use an Ingredient that does not exist
    When I create a Recipe with JSON:
      """
      {"name": "Lasagne pack", "yield": 2, "readyMeal": true, "lines": [],
       "steps": [{"text": "Heat", "kind": "active", "durationMinutes": 5,
                  "uses": [{"ingredientId": -1, "quantity": 1, "unit": "piece"}]}]}
      """
    Then the response status is 422
    And the Recipe JSON "error.reason" is "unknown_ingredient"
    And the household has no Ingredient "Lasagne pack"
