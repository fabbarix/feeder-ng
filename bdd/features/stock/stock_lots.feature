Feature: Stock Lots
  Stock is a set of Stock Lots. Each holds an Ingredient, a quantity in Base Units,
  a purchase date and a go-off date (purchase date plus Shelf Life, or none).

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "chicken thighs" in g with a Shelf Life of 4 days
    And Stock knows the Ingredient "milk" in ml with no Shelf Life

  Scenario: A manual add gets its go-off date from the Shelf Life
    When I add a Stock Lot of 800 g of "chicken thighs" bought on "2026-11-07"
    Then the response status is 201
    And the response JSON field "goesOff" is "2026-11-11"
    And the response JSON field "source" is "manual"
    And Stock holds 800 g of "chicken thighs"

  Scenario: An Ingredient without a Shelf Life has no go-off date
    When I add a Stock Lot of 1000 ml of "milk" bought today
    Then the response status is 201
    And the Stock Lot just added has no go-off date
    And the response JSON field "purchased" is "2026-11-09"

  Scenario: Several Stock Lots of one Ingredient add up
    When I add a Stock Lot of 500 g of "chicken thighs" bought today
    And I add a Stock Lot of 300 g of "chicken thighs" bought on "2026-11-06"
    Then Stock holds 800 g of "chicken thighs"
    And "chicken thighs" has 2 Stock Lots going off on "2026-11-10, 2026-11-13"

  Scenario: Stock is never negative or empty-added
    When I add a Stock Lot of 0 g of "milk" bought today
    Then the response status is 422
    And the error code is "validation_failed"
    And Stock holds nothing of "milk"

  Scenario: A scan from the offline queue is added only once
    When I scan-add a Stock Lot of 1000 ml of "milk" with client id "scan-0001"
    And I scan-add a Stock Lot of 1000 ml of "milk" with client id "scan-0001"
    Then the response status is 200
    And Stock holds 1000 ml of "milk"
    And "milk" has 1 Stock Lots going off on ""

  Scenario: A Stock Lot of an unknown Ingredient is refused
    When I POST "/api/stock/lots" with JSON:
      """
      {"ingredientId": 987654, "quantity": 5}
      """
    Then the response status is 422
    And the error code is "unknown_ingredient"

  Scenario: Stock is private to signed-in people
    Given I am not signed in
    When I GET "/api/stock"
    Then the response status is 401
