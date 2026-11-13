Feature: Quick Use of a Supply
  The Supplies list shows each Supply's Stock and lets the User take some of it out with one tap. Use takes from the Supply's
  Lots, oldest purchased first. It is Used up, never waste: no waste record, no Throw out, and the zero-waste streak does not
  move. Undo puts back exactly what was taken. Only a Supply can be used this way. (docs/dev/design/household-items.md
  section 4.11, WP H9)

  Background:
    Given a running Feeder
    And I am signed in as the User
    And a Quick Use Supply "Toilet paper" counted in piece
    And a Quick Use Supply "Dish soap" counted in ml
    And a Quick Use food Ingredient "Milk" counted in ml

  Scenario: One tap uses one from the oldest Lot
    Given Quick Use Stock of "Toilet paper": 9 piece bought on "2026-11-05"
    And Quick Use Stock of "Toilet paper": 4 piece bought on "2026-11-01"
    When I Quick Use 1 of "Toilet paper"
    Then the Quick Use answer says 1 taken and 12 left
    And the Quick Use answer took 1 from the Lot bought on "2026-11-01"
    And the Quick Use Stock total of "Toilet paper" is 12

  Scenario: A larger Use runs on into the next Lot and the emptied Lot goes
    Given Quick Use Stock of "Toilet paper": 9 piece bought on "2026-11-05"
    And Quick Use Stock of "Toilet paper": 4 piece bought on "2026-11-01"
    When I Quick Use 6 of "Toilet paper"
    Then the Quick Use answer took 4 from the Lot bought on "2026-11-01"
    And the Quick Use answer took 2 from the Lot bought on "2026-11-05"
    And "Toilet paper" has 1 Quick Use Lots in Stock
    And the Quick Use Stock total of "Toilet paper" is 7

  Scenario: Using part of a liquid Supply
    Given Quick Use Stock of "Dish soap": 500 ml bought on "2026-11-01"
    When I Quick Use 125 of "Dish soap"
    Then the Quick Use Stock total of "Dish soap" is 375

  Scenario: Using it up leaves none in Stock
    Given Quick Use Stock of "Toilet paper": 2 piece bought on "2026-11-01"
    When I Quick Use 2 of "Toilet paper"
    Then the Quick Use Stock total of "Toilet paper" is 0
    And "Toilet paper" has 0 Quick Use Lots in Stock

  Scenario: Use is Used up, not waste, and the streak does not move
    Given Quick Use Stock of "Toilet paper": 3 piece bought on "2026-11-01"
    And I note the Quick Use streak
    When I Quick Use 3 of "Toilet paper"
    Then the Quick Use waste list is empty
    And the Quick Use streak has not moved

  Scenario: Undo puts back exactly what was taken
    Given Quick Use Stock of "Toilet paper": 9 piece bought on "2026-11-05"
    And Quick Use Stock of "Toilet paper": 4 piece bought on "2026-11-01"
    And I Quick Use 6 of "Toilet paper"
    When I Undo that Quick Use
    Then the Quick Use Undo says 6 came back and 13 are in Stock
    And "Toilet paper" has 2 Quick Use Lots in Stock
    And the Quick Use Lots of "Toilet paper" are 4 bought on "2026-11-01" and 9 bought on "2026-11-05"

  Scenario: Cannot use more than is in Stock
    Given Quick Use Stock of "Toilet paper": 2 piece bought on "2026-11-01"
    When I Quick Use 3 of "Toilet paper"
    Then the Quick Use is refused with "use_exceeds_stock"
    And the Quick Use Stock total of "Toilet paper" is 2

  Scenario: Cannot use a Supply that has no Stock
    When I Quick Use 1 of "Toilet paper"
    Then the Quick Use is refused with "use_exceeds_stock"

  Scenario: Cannot use nothing or less
    Given Quick Use Stock of "Toilet paper": 2 piece bought on "2026-11-01"
    When I Quick Use 0 of "Toilet paper"
    Then the Quick Use is refused with "use_quantity_invalid"
    When I Quick Use -1 of "Toilet paper"
    Then the Quick Use is refused with "use_quantity_invalid"
    And the Quick Use Stock total of "Toilet paper" is 2

  Scenario: Food has no Quick Use
    Given Quick Use Stock of "Milk": 1000 ml bought on "2026-11-08"
    When I Quick Use 100 of "Milk"
    Then the Quick Use is refused with "ingredient_not_supply"
    And the Quick Use Stock total of "Milk" is 1000

  Scenario: The Supply's Restock Line follows its Stock after a Use
    Given the Quick Use Supply "Toilet paper" has a Restock level of 6
    And Quick Use Stock of "Toilet paper": 8 piece bought on "2026-11-01"
    When I Quick Use 3 of "Toilet paper"
    Then the Quick Use Supply "Toilet paper" shows 5 in Stock below its Restock level 6
