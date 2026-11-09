Feature: Products and the Ingredient they supply
  Products are referenced by their Ingredient: merging Ingredients moves them, and an Ingredient
  with Products keeps its Base Unit.

  Background:
    Given a running Feeder
    And an Ingredient "passata" counted in g exists for Products
    And an Ingredient "tomato passata" counted in g exists for Products
    And the Product "Mutti passata" of Ingredient "passata" with pack size 700 exists
    And I am signed in as the User

  Scenario: The Ingredient page counts its Products
    When I send GET "/api/ingredients/{ingredient:passata}" for Products
    Then the Products response value at "references.products" is "1"

  Scenario: Merging two Ingredients moves the Products to the surviving one
    When I send POST "/api/ingredients/{ingredient:passata}/merge" for Products with JSON:
      """
      {"into": {ingredient:tomato passata}}
      """
    Then the response status is 200
    When I send GET "/api/products/{product:Mutti passata}" for Products
    Then the Products response value at "ingredientId" is "{ingredient:tomato passata}"
    And the Products response value at "ingredientName" is "tomato passata"

  Scenario: An Ingredient with Products keeps its Base Unit and cannot be deleted
    When I send PATCH "/api/ingredients/{ingredient:passata}" for Products with JSON:
      """
      {"baseUnit": "ml"}
      """
    Then the response status is 409
    And the error code is "in_use"
    When I send DELETE "/api/ingredients/{ingredient:passata}" for Products
    Then the response status is 409
    And the error code is "in_use"
