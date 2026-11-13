Feature: Food-only paths refuse a Supply
  A Supply is an Ingredient of kind supply that is never food. The server refuses it wherever only food belongs, not only
  the screens: a Recipe line, a Ready Meal's or Base recipe's Ingredient, a Base recipe link, an Exclusion, and an Import
  Review match. Codes: 422 validation_failed with the reason "ingredient_is_supply" or "supply_name_taken".
  (ADR 0017, docs/dev/design/household-items.md section 2, guards 2 to 7)

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Household has the Ingredient "milk" with Base Unit ml
    And the Household has these Supplies:
      | name         | baseUnit | restockLevel |
      | Dish soap    | ml       |              |
      | Toilet paper | piece    | 9            |

  # ---- guard 2: a Recipe line ----

  Scenario: A Recipe line cannot be a Supply
    When I create a Recipe with JSON:
      """
      {"name": "Soapy soup", "yield": 2, "lines": [
        {"ingredientId": <id:milk>, "quantity": 200, "unit": "ml"},
        {"ingredientId": <id:Dish soap>, "quantity": 10, "unit": "ml"}]}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the error reason is "ingredient_is_supply"
    And the error field is "lines[1].ingredientId"
    And the household has 0 Recipes

  Scenario: A Step cannot use a Supply, even one on no line
    When I create a Recipe with JSON:
      """
      {"name": "Soapy soup", "yield": 2, "lines": [{"ingredientId": <id:milk>, "quantity": 200, "unit": "ml"}],
       "steps": [{"text": "Wipe the pan", "kind": "active", "durationMinutes": 2,
                  "uses": [{"ingredientId": <id:Dish soap>, "quantity": 5, "unit": "ml"}]}]}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the error reason is "ingredient_is_supply"
    And the error field is "steps[0].uses[0].ingredientId"
    And the household has 0 Recipes

  Scenario: A saved Recipe cannot be given a Supply line
    When I create a Recipe with JSON:
      """
      {"name": "Soup", "yield": 2, "lines": [{"ingredientId": <id:milk>, "quantity": 200, "unit": "ml"}]}
      """
    Then the response status is 201
    When I replace the Recipe "Soup" with JSON:
      """
      {"name": "Soup", "yield": 2, "lines": [
        {"ingredientId": <id:milk>, "quantity": 200, "unit": "ml"},
        {"ingredientId": <id:Dish soap>, "quantity": 10, "unit": "ml"}]}
      """
    Then the response status is 422
    And the error reason is "ingredient_is_supply"
    When I open the Recipe "Soup"
    Then the Recipe JSON "lines.0.ingredient" is "milk"

  Scenario: A Base recipe line cannot be a Supply
    When I create a Recipe with JSON:
      """
      {"name": "Bechamel", "baseRecipe": true, "yield": 1, "yieldUnit": "l", "lines": [
        {"ingredientId": <id:Dish soap>, "quantity": 10, "unit": "ml"}]}
      """
    Then the response status is 422
    And the error reason is "ingredient_is_supply"
    And the household has 0 Recipes

  Scenario: A Ready Meal's named pack line cannot be a Supply
    When I create a Recipe with JSON:
      """
      {"name": "Pack", "yield": 2, "readyMeal": true, "lines": [{"ingredientId": <id:Toilet paper>, "quantity": 1, "unit": "piece"}]}
      """
    Then the response status is 422
    And the error reason is "ingredient_is_supply"

  # ---- guard 3: a Ready Meal's Ingredient (a Recipe line) is named like the Recipe ----

  Scenario: A Ready Meal cannot be named like a Supply
    When I create a Recipe with JSON:
      """
      {"name": "toilet PAPER", "yield": 2, "readyMeal": true, "lines": []}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the error reason is "supply_name_taken"
    And the error field is "name"
    And the household has 0 Recipes
    And the household has 3 Ingredients

  # ---- guard 4: a Base recipe's Ingredient is named like the Base recipe ----

  Scenario: A Base recipe cannot be named like a Supply
    When I create a Recipe with JSON:
      """
      {"name": "Dish soap", "baseRecipe": true, "yield": 1, "yieldUnit": "l"}
      """
    Then the response status is 422
    And the error reason is "supply_name_taken"
    And the error field is "name"
    And the household has 0 Recipes

  Scenario: A Base recipe cannot take a Supply over, whatever the answer
    When I create a Recipe with JSON:
      """
      {"name": "Dish soap", "baseRecipe": true, "yield": 1, "yieldUnit": "l", "takeOver": true}
      """
    Then the response status is 422
    And the error reason is "supply_name_taken"

  Scenario: A Recipe named like a Supply cannot be made a Base recipe
    When I create a Recipe with JSON:
      """
      {"name": "Dish soap", "yield": 2, "lines": [{"ingredientId": <id:milk>, "quantity": 200, "unit": "ml"}]}
      """
    Then the response status is 201
    When I send POST "/api/recipes/<recipe:Dish soap>/to-base" with ids filled in:
      """
      {"yield": 1, "yieldUnit": "l", "takeOver": true}
      """
    Then the response status is 422
    And the error reason is "supply_name_taken"
    When I open the Recipe "Dish soap"
    Then the Recipe JSON "baseRecipe" is "false"

  # ---- guard 6: Exclusions ----

  Scenario: An Exclusion cannot target a Supply
    Given the Household has the Member "Sam" with Portion Factor 1
    When I send PUT "/api/ingredient-exclusions/<id:Dish soap>" with ids filled in:
      """
      {"excluded": true, "memberId": <member:Sam>}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the error reason is "ingredient_is_supply"

  Scenario: An Exclusion still targets food
    Given the Household has the Member "Sam" with Portion Factor 1
    When I send PUT "/api/ingredient-exclusions/<id:milk>" with ids filled in:
      """
      {"excluded": true, "memberId": <member:Sam>}
      """
    Then the response status is 200

  # ---- guard 7: Import Review and the Recipe Assistant never match a Supply ----

  Scenario: Import Review never matches a Supply
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "ingredients": [{"name": "dish soap", "baseUnit": "ml"}, {"name": "milk", "baseUnit": "ml"}],
       "recipes": [{"name": "Soapy soup", "yield": 2,
                    "ingredients": [{"ingredient": "dish soap", "quantity": 10, "unit": "ml"},
                                    {"ingredient": "milk", "quantity": 200, "unit": "ml"}]}]}
      """
    Then the response status is 201
    And the review lists the Ingredient "dish soap" as a Supply name
    And the review lists the Ingredient "milk" as "exact"
    And the review is not ready
    And the review has a problem "supply_name_taken" saying "is one of your Supplies"
    When I confirm the review with no answers
    Then the response status is 422
    And the error code is "import_not_ready"
    And the household has 0 Recipes

  Scenario: A name a Supply holds is resolved by renaming it
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "ingredients": [{"name": "dish soap", "baseUnit": "ml"}],
       "recipes": [{"name": "Soapy soup", "yield": 2,
                    "ingredients": [{"ingredient": "dish soap", "quantity": 10, "unit": "ml"}]}]}
      """
    And I answer the review with:
      """
      {"decisions": {"ingredients": [{"key": "dish soap", "action": "create", "name": "dish soap (washing up)"}]}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 200
    And the household has the Ingredient "dish soap (washing up)"
    And the household has 4 Ingredients
    And the Recipe "Soapy soup" uses the Ingredient "dish soap (washing up)"
    When I GET the Ingredient "Dish soap"
    Then the response JSON field "kind" is "supply"

  Scenario: Import Review never suggests a Supply
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "ingredients": [{"name": "toilet papers", "baseUnit": "piece"}],
       "recipes": [{"name": "Paper dolls", "yield": 2,
                    "ingredients": [{"ingredient": "toilet papers", "quantity": 1, "unit": "piece"}]}]}
      """
    Then the review lists the Ingredient "toilet papers" as "new"
    And the review offers no suggestion for "toilet papers"
    And the review is ready

  Scenario: A Ready Meal in a file cannot be named like a Supply
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "recipes": [{"name": "Toilet paper", "yield": 2, "readyMeal": true,
                    "ingredients": [{"ingredient": "toilet paper", "quantity": 1, "unit": "piece"}]}]}
      """
    Then the review lists the Ingredient "toilet paper" as a Supply name
    And the review is not ready
