Feature: Spoiled Stock Lots
  Stock Lots past their go-off date are listed as spoiled ("Throw out or keep?").
  Throw out removes the lot and records the waste. Keep pushes the go-off date out
  by 1 day from its existing go-off date (not from today).

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "chicken thighs" in g with a Shelf Life of 4 days
    And Stock knows the Ingredient "milk" in ml with no Shelf Life

  Scenario: Only Stock Lots past their go-off date are spoiled
    Given I add a Stock Lot of 200 g of "chicken thighs" bought on "2026-11-01"
    And I add a Stock Lot of 300 g of "chicken thighs" bought on "2026-11-05"
    And I add a Stock Lot of 1000 ml of "milk" bought on "2026-10-01"
    When I list the spoiled Stock Lots
    Then the spoiled list has 1 Stock Lot
    And the spoiled list includes the Stock Lot of 200 g of "chicken thighs"

  Scenario: A Stock Lot is still fine on its go-off date
    Given I add a Stock Lot of 300 g of "chicken thighs" bought on "2026-11-05"
    When I list the spoiled Stock Lots
    Then the spoiled list has 0 Stock Lots

  Scenario: A Stock Lot becomes spoiled when a day passes
    Given I add a Stock Lot of 300 g of "chicken thighs" bought on "2026-11-05"
    When 1 days go by in the kitchen
    And I list the spoiled Stock Lots
    Then the spoiled list has 1 Stock Lot

  Scenario: Throw out removes the Stock Lot and records the waste
    Given I add a Stock Lot of 200 g of "chicken thighs" bought on "2026-11-01"
    When I throw out the spoiled Stock Lot of "chicken thighs"
    Then the response status is 200
    And Stock holds nothing of "chicken thighs"
    And the waste records show 200 g of "chicken thighs" wasted because it spoiled

  Scenario: Keep pushes the go-off date one day from the existing date
    Given I add a Stock Lot of 200 g of "chicken thighs" bought on "2026-11-04"
    When I keep the spoiled Stock Lot of "chicken thighs"
    Then the response status is 200
    And the response JSON field "goesOff" is "2026-11-09"
    And the response JSON field "spoiled" is false
    And Stock holds 200 g of "chicken thighs"

  Scenario: A Stock Lot several days overdue stays spoiled after Keep
    Given I add a Stock Lot of 200 g of "chicken thighs" bought on "2026-11-01"
    When I keep the spoiled Stock Lot of "chicken thighs"
    Then the response JSON field "goesOff" is "2026-11-06"
    When I list the spoiled Stock Lots
    Then the spoiled list has 1 Stock Lot

  Scenario: A Stock Lot that has not gone off cannot be thrown out or kept
    Given I add a Stock Lot of 200 g of "chicken thighs" bought today
    When I throw out the newest Stock Lot of "chicken thighs"
    Then the response status is 409
    And the error code is "not_spoiled"
