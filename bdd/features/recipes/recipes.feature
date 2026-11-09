Feature: Recipes
  A Recipe has a Yield, ingredient lines for one Batch, optional timed Steps and
  Tags that the household defines by using them. Total time is the critical path
  of the Steps; Advance Steps are listed separately.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Ingredient "flour" exists with Base Unit "g"
    And the Ingredient "milk" exists with Base Unit "ml"
    And the Ingredient "egg" exists with Base Unit "piece"

  Scenario: Creating a Recipe with lines, Steps and Tags
    When I create a Recipe with JSON:
      """
      {
        "name": "Pancakes", "description": "Thin ones", "yield": 4,
        "tags": ["Breakfast", "sweet"],
        "cooldownDays": 10, "leftoverUseByDays": 0,
        "source": {"url": "https://example.test/pancakes", "attribution": "Gran"},
        "lines": [
          {"ingredientId": <id:flour>, "quantity": 250, "unit": "g", "note": "sifted"},
          {"ingredientId": <id:milk>, "quantity": 3, "unit": "dl"},
          {"ingredientId": <id:egg>, "quantity": 2, "unit": "piece", "optional": true}
        ],
        "steps": [{"text": "Whisk", "kind": "active", "durationMinutes": 5}]
      }
      """
    Then the response status is 201
    And the Recipe JSON "name" is "Pancakes"
    And the Recipe JSON "yield" is "4"
    And the Recipe JSON "readyMeal" is "false"
    And the Recipe JSON "archived" is "false"
    And the Recipe JSON "cooldownDays" is "10"
    And the Recipe JSON "leftoverUseByDays" is "0"
    And the Recipe JSON "lines.0.ingredient" is "flour"
    And the Recipe JSON "lines.1.unit" is "dl"
    And the Recipe JSON "lines.2.optional" is "true"
    And the Recipe JSON "tags.1" is "sweet"
    And the Recipe JSON "totalMinutes" is "5"

  Scenario: Total time is the critical path and Advance Steps show separately
    When I create a Recipe with JSON:
      """
      {
        "name": "Roast tray", "yield": 4,
        "lines": [{"ingredientId": <id:flour>, "quantity": 1, "unit": "g"}],
        "steps": [
          {"text": "Marinate", "kind": "advance", "leadTimeMinutes": 240},
          {"text": "Heat the oven", "kind": "active", "durationMinutes": 2},
          {"text": "Cut the veg", "kind": "active", "durationMinutes": 8},
          {"text": "Roast the tray", "kind": "passive", "durationMinutes": 25, "after": [1, 2]},
          {"text": "Cook the rice", "kind": "passive", "durationMinutes": 15},
          {"text": "Serve", "kind": "active", "durationMinutes": 5, "after": [3, 4]}
        ]
      }
      """
    Then the response status is 201
    And the Recipe JSON "totalMinutes" is "40"
    And the Recipe JSON "advanceMinutes" is "240"
    And the Recipe JSON "advance.0.step" is "0"
    And the Recipe JSON "advance.0.leadTimeMinutes" is "240"

  Scenario: Steps that cannot be scheduled are refused
    When I create a Recipe with JSON:
      """
      {
        "name": "Broken", "yield": 1,
        "lines": [{"ingredientId": <id:flour>, "quantity": 1, "unit": "g"}],
        "steps": [{"text": "Simmer", "kind": "passive"}]
      }
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the Recipe JSON "error.field" is "steps[0]"
    And the Recipe JSON "error.reason" is "passive_needs_duration"

  Scenario: A Recipe needs a name and a positive Yield
    When I create a Recipe with JSON:
      """
      {"name": "  ", "yield": 4, "lines": [{"ingredientId": <id:flour>, "quantity": 1, "unit": "g"}]}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the Recipe JSON "error.field" is "name"
    When I create a Recipe with JSON:
      """
      {"name": "Soup", "yield": 0, "lines": [{"ingredientId": <id:flour>, "quantity": 1, "unit": "g"}]}
      """
    Then the response status is 422
    And the Recipe JSON "error.field" is "yield"

  Scenario: A Ready Meal has exactly one ingredient line
    When I create a Recipe with JSON:
      """
      {
        "name": "Lasagne pack", "yield": 2, "readyMeal": true,
        "lines": [{"ingredientId": <id:egg>, "quantity": 1, "unit": "piece"}]
      }
      """
    Then the response status is 201
    And the Recipe JSON "readyMeal" is "true"
    And the Recipe JSON "totalMinutes" is "0"
    When I create a Recipe with JSON:
      """
      {
        "name": "Two-line pack", "yield": 2, "readyMeal": true,
        "lines": [
          {"ingredientId": <id:egg>, "quantity": 1, "unit": "piece"},
          {"ingredientId": <id:milk>, "quantity": 1, "unit": "dl"}
        ]
      }
      """
    Then the response status is 422
    And the Recipe JSON "error.reason" is "ready_meal_lines"

  Scenario: Tags are created when first used and shared by spelling-insensitive name
    Given I have created the Recipe "Fish pie" tagged "Fish, oven"
    And I have created the Recipe "Fish fingers" tagged "FISH, quick"
    When I open the Recipe "Fish fingers"
    Then the Recipe JSON "tags.0" is "Fish"
    When I list the Tags
    Then the Tag names are "Fish, oven, quick"

  Scenario: Replacing a Recipe overwrites its lines and Steps
    Given I have created the Recipe "Pancakes" tagged "sweet"
    When I replace the Recipe "Pancakes" with JSON:
      """
      {
        "name": "Crepes", "yield": 2,
        "lines": [{"ingredientId": <id:milk>, "quantity": 5, "unit": "dl"}],
        "steps": []
      }
      """
    Then the response status is 200
    And the Recipe JSON "name" is "Crepes"
    And the Recipe JSON "lines.0.ingredient" is "milk"
    And the Recipe JSON "tags" is "[]"

  Scenario: Listing Recipes by name, with a name filter
    Given I have created the Recipe "banana bread" tagged "baking"
    And I have created the Recipe "Apple pie" tagged "baking"
    And I have created the Recipe "Chilli" tagged "spicy"
    When I list the Recipes
    Then the Recipe names are "Apple pie, banana bread, Chilli"
    When I list the Recipes with query "CHIL"
    Then the Recipe names are "Chilli"
    When I list the Recipes tagged "baking"
    Then the Recipe names are "Apple pie, banana bread"

  Scenario: Unknown Recipes are not found
    When I open the Recipe with id 999
    Then the response status is 404
    And the error code is "not_found"

  Scenario: Recipes need a signed-in User
    Given I am not signed in
    When I GET "/api/recipes"
    Then the response status is 401
