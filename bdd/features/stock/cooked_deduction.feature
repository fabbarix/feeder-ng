Feature: Stock when a meal is Cooked
  Marking a Planned Meal Cooked deducts Stock (ADR 0003). It never blocks. If Stock
  is short it warns, and if the warning is dismissed Stock floors at 0.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "chicken thighs" in g with a Shelf Life of 4 days
    And Stock knows the Ingredient "milk" in ml with no Shelf Life

  Scenario: Enough Stock is deducted from the Stock Lot that goes off soonest
    Given I add a Stock Lot of 500 g of "chicken thighs" bought on "2026-11-08"
    And I add a Stock Lot of 300 g of "chicken thighs" bought on "2026-11-06"
    When a meal is Cooked needing 600 g of "chicken thighs"
    Then the response status is 200
    And there is no Stock warning
    And Stock holds 200 g of "chicken thighs"
    And "chicken thighs" has 1 Stock Lots going off on "2026-11-12"

  Scenario: Short Stock warns and floors at 0
    Given I add a Stock Lot of 300 g of "chicken thighs" bought today
    When a meal is Cooked needing 800 g of "chicken thighs"
    Then the response status is 200
    And the Stock warning reads "Stock shows only 300 g chicken thighs, the recipe uses 800 g"
    And Stock holds nothing of "chicken thighs"

  Scenario: Nothing in Stock still never blocks
    When a meal is Cooked needing 250 ml of "milk"
    Then the response status is 200
    And the Stock warning reads "Stock shows no milk, the recipe uses 250 ml"
    And Stock holds nothing of "milk"

  Scenario: One-tap Stock correction after a warning
    Given I add a Stock Lot of 300 g of "chicken thighs" bought today
    And a meal is Cooked needing 800 g of "chicken thighs"
    When I do a Stock-take setting "chicken thighs" to 150 g
    Then Stock holds 150 g of "chicken thighs"

  Scenario: Cooking several Ingredients deducts each one
    Given I add a Stock Lot of 1000 ml of "milk" bought today
    And I add a Stock Lot of 500 g of "chicken thighs" bought today
    When a meal is Cooked needing 250 ml of "milk" and 400 g of "chicken thighs"
    Then there is no Stock warning
    And Stock holds 750 ml of "milk"
    And Stock holds 100 g of "chicken thighs"
