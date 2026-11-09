Feature: Stock-take
  A Stock-take sets an Ingredient's total. A decrease removes quantity from the
  soonest-to-spoil Stock Lots first. An increase adds a new Stock Lot dated today.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "chicken thighs" in g with a Shelf Life of 4 days

  Scenario: A decrease takes from the Stock Lot that goes off soonest
    Given I add a Stock Lot of 500 g of "chicken thighs" bought on "2026-11-08"
    And I add a Stock Lot of 300 g of "chicken thighs" bought on "2026-11-06"
    When I do a Stock-take setting "chicken thighs" to 600 g
    Then the response status is 200
    And Stock holds 600 g of "chicken thighs"
    And "chicken thighs" has 2 Stock Lots going off on "2026-11-10, 2026-11-12"

  Scenario: An increase adds a new Stock Lot dated today
    Given I add a Stock Lot of 300 g of "chicken thighs" bought on "2026-11-08"
    When I do a Stock-take setting "chicken thighs" to 1000 g
    Then Stock holds 1000 g of "chicken thighs"
    And "chicken thighs" has 2 Stock Lots going off on "2026-11-12, 2026-11-13"
    And the newest Stock Lot of "chicken thighs" has source "stock_take"

  Scenario: Setting the total to zero empties the Ingredient
    Given I add a Stock Lot of 300 g of "chicken thighs" bought today
    When I do a Stock-take setting "chicken thighs" to 0 g
    Then Stock holds nothing of "chicken thighs"

  Scenario: A negative total is refused
    Given I add a Stock Lot of 300 g of "chicken thighs" bought today
    When I do a Stock-take setting "chicken thighs" to -5 g
    Then the response status is 422
    And the error code is "validation_failed"
    And Stock holds 300 g of "chicken thighs"
