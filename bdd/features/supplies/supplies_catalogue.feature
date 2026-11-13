Feature: Supplies in the catalogue
  A Supply is a thing that is not food, which the Household buys and keeps in Stock (dish soap, toilet paper, batteries).
  It is an Ingredient of kind supply: it has Products, Prices and Stock like food, no Shelf Life, and an optional
  Restock level. Food-only things never use it. (ADR 0017, docs/dev/design/household-items.md)

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: An Ingredient is food unless it is made a Supply
    Given the Household has the Ingredient "milk" with Base Unit ml
    When I GET the Ingredient "milk"
    Then the response status is 200
    And the response JSON field "kind" is "food"
    And the response JSON field "restockLevel" is null

  Scenario: Create a Supply with a Restock level
    When I POST "/api/ingredients" with JSON:
      """
      {"name": "Toilet paper", "baseUnit": "piece", "kind": "supply", "restockLevel": 9}
      """
    Then the response status is 201
    And the response JSON field "kind" is "supply"
    And the response JSON field "restockLevel" is "9"
    And the Ingredient response has no Shelf Life

  Scenario: A Supply never has a Shelf Life
    When I POST "/api/ingredients" with JSON:
      """
      {"name": "Dish soap", "baseUnit": "ml", "kind": "supply", "shelfLifeDays": 30}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the error reason is "supply_has_shelf_life"

  Scenario: Food never has a Restock level
    When I POST "/api/ingredients" with JSON:
      """
      {"name": "rice", "baseUnit": "g", "restockLevel": 500}
      """
    Then the response status is 422
    And the error code is "validation_failed"
    And the error reason is "restock_level_on_food"

  Scenario: The Restock level can be set and cleared
    Given the Household has these Supplies:
      | name      | baseUnit | restockLevel |
      | Batteries | piece    |              |
    When I PATCH the Ingredient "Batteries" with JSON:
      """
      {"restockLevel": 4}
      """
    Then the response status is 200
    And the response JSON field "restockLevel" is "4"
    When I PATCH the Ingredient "Batteries" with JSON:
      """
      {"restockLevel": null}
      """
    Then the response status is 200
    And the response JSON field "restockLevel" is null

  Scenario: The list can be narrowed to one kind
    Given the Household has the Ingredient "milk" with Base Unit ml
    And the Household has these Supplies:
      | name         | baseUnit | restockLevel |
      | Bin bags     | piece    |              |
      | AA batteries | piece    | 4            |
    When I list the Ingredients of kind "supply"
    Then the Ingredient list names are "AA batteries, Bin bags"
    When I list the Ingredients of kind "food"
    Then the Ingredient list names are "milk"
    When I GET "/api/ingredients"
    Then the Ingredient list names are "AA batteries, Bin bags, milk"

  Scenario: A name means one thing across both kinds
    Given the Household has the Ingredient "Vinegar" with Base Unit ml
    When I POST "/api/ingredients" with JSON:
      """
      {"name": "vinegar", "baseUnit": "ml", "kind": "supply"}
      """
    Then the response status is 409
    And the error code is "name_taken"

  Scenario: A Supply cannot be merged with food
    Given the Household has the Ingredient "vinegar" with Base Unit ml
    And the Household has these Supplies:
      | name     | baseUnit | restockLevel |
      | descaler | ml       |              |
    When I preview merging the Ingredient "descaler" into "vinegar"
    Then the response status is 200
    And the response JSON field "blocked" is "kind_differs"
    When I merge the Ingredient "descaler" into "vinegar"
    Then the response status is 409
    And the error code is "kind_differs"
    And the Ingredient "descaler" still exists

  Scenario: Two Supplies can be merged
    Given the Household has these Supplies:
      | name         | baseUnit | restockLevel |
      | loo roll     | piece    | 4            |
      | toilet paper | piece    | 9            |
    When I merge the Ingredient "loo roll" into "toilet paper"
    Then the response status is 200
    And the response JSON field "kind" is "supply"
    And the response JSON field "restockLevel" is "9"
    And the Ingredient "loo roll" no longer exists

  Scenario: An Ingredient on a Recipe cannot become a Supply
    Given the Household has the Ingredient "vinegar" with Base Unit piece
    And the Household has the Recipe "Pickles" with a line of the Ingredient "vinegar"
    When I PATCH the Ingredient "vinegar" with JSON:
      """
      {"kind": "supply"}
      """
    Then the response status is 409
    And the error code is "kind_in_use"
    And the error reasons are "recipe_lines"
    When I GET the Ingredient "vinegar"
    Then the response JSON field "kind" is "food"

  Scenario: An Ingredient nothing food-only uses becomes a Supply and loses its Shelf Life
    Given the Household has these Ingredients:
      | name         | baseUnit | shelfLifeDays |
      | Toilet paper | piece    | 365           |
    When I PATCH the Ingredient "Toilet paper" with JSON:
      """
      {"kind": "supply", "restockLevel": 9}
      """
    Then the response status is 200
    And the response JSON field "kind" is "supply"
    And the response JSON field "restockLevel" is "9"
    And the Ingredient response has no Shelf Life

  Scenario: A Supply made food again loses its Restock level
    Given the Household has these Supplies:
      | name    | baseUnit | restockLevel |
      | Vinegar | ml       | 500          |
    When I PATCH the Ingredient "Vinegar" with JSON:
      """
      {"kind": "food"}
      """
    Then the response status is 200
    And the response JSON field "kind" is "food"
    And the response JSON field "restockLevel" is null
