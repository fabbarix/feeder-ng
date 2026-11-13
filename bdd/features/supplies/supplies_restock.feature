Feature: Restock Lines for Supplies
  A Supply with a Restock level asks for itself on the Shopping List when its Stock falls below the level: the Line is the
  level less Stock, as packs of the Product last bought. It does not depend on the plan or the range. A Supply Line is
  ticked, bought, scanned and marked Not needed like any other Line. Stock lists and offline rows say which rows are
  Supplies, and a Supply's Lot never goes off. (docs/dev/design/household-items.md section 4.4, WP H4)

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Household has the Shop "Coop" for Supplies
    And the Household has the Supply "Toilet paper" counted in piece with a Restock level of 9
    And the Supply "Toilet paper" is sold as the Product "Lotus 9 rolls" of pack size 9 with barcode "5410091000004"

  Scenario: Below the Restock level the list asks for the difference in whole packs
    Given the Product "Lotus 9 rolls" of the Supply was last bought at the Shop "Coop"
    And the Household holds 2 piece of the Supply "Toilet paper"
    When I view the Supplies list
    Then the Supplies list has a Line for "Toilet paper" of 7 piece
    And the Line "Toilet paper" says 2 of 9 in Stock
    And the Line "Toilet paper" suggests 1 pack of "Lotus 9 rolls"
    And the Line "Toilet paper" has kind "supply"
    And the Supplies list has 1 entries in all

  Scenario: At or above the level there is no Line
    Given the Household holds 9 piece of the Supply "Toilet paper"
    When I view the Supplies list
    Then the Supplies list has no Line for "Toilet paper"

  Scenario: A Supply with no Stock at all asks for the whole level
    When I view the Supplies list
    Then the Supplies list has a Line for "Toilet paper" of 9 piece

  Scenario: The Line does not depend on the range
    Given the Household holds 2 piece of the Supply "Toilet paper"
    When I view the Supplies list until "2026-11-09"
    Then the Supplies list has a Line for "Toilet paper" of 7 piece

  Scenario: Ticking the Line by hand adds the Stock and keeps the Line ticked
    Given the Household holds 2 piece of the Supply "Toilet paper"
    When I tick the Supply "Toilet paper" on the list by hand with 7 piece
    Then the Stock total of the Supply "Toilet paper" is 9
    When I view the Supplies list
    Then the Line "Toilet paper" is ticked
    And the Supplies list is complete

  Scenario: Buying the Supply by scan ticks the Line and raises Stock
    Given the Household holds 2 piece of the Supply "Toilet paper"
    When I scan the barcode "5410091000004" at the Shop "Coop" as Restock scan "scan-0001"
    Then Restock scan "scan-0001" was applied
    And Restock scan "scan-0001" ticked the Line
    And the Stock total of the Supply "Toilet paper" is 11
    When I view the Supplies list
    Then the Line "Toilet paper" is ticked

  Scenario: Scanning a Supply that is at its level is not on the list
    Given the Household holds 9 piece of the Supply "Toilet paper"
    When I scan the barcode "5410091000004" at the Shop "Coop" as Restock scan "scan-0001"
    Then Restock scan "scan-0001" was applied
    And Restock scan "scan-0001" was not on the list

  Scenario: A Restock Line and an extra of the same Supply both show
    Given the Household holds 2 piece of the Supply "Toilet paper"
    When I add a list extra of 4 piece of the Supply "Toilet paper"
    And I view the Supplies list
    Then the Supplies list has a Line for "Toilet paper" of 7 piece
    And the Supplies list has an extra of "Toilet paper" of kind "supply"
    And the Supplies list has 2 entries in all

  Scenario: Not needed takes the Restock Line off the list for the range
    Given the Household holds 2 piece of the Supply "Toilet paper"
    When I mark the Supply "Toilet paper" as Not needed
    And I view the Supplies list
    Then the Supplies list has no Line for "Toilet paper"
    And Not needed holds "Toilet paper" of kind "supply"

  Scenario: Stock rows and Lots say which are Supplies
    Given the Household holds 2 piece of the Supply "Toilet paper"
    When I list the Stock rows
    Then the Stock row of "Toilet paper" has kind "supply"
    When I list the Stock Lots of the Supply "Toilet paper"
    Then every Lot has kind "supply"

  Scenario: The offline data says which Products are of Supplies
    When I load the offline scan data for the Shop "Coop"
    Then the offline Product "Lotus 9 rolls" is of kind "supply"

  Scenario: A Lot of a Supply never gets a go-off date
    Given the Household holds 2 piece of the Supply "Toilet paper"
    When I edit the newest Lot of the Supply "Toilet paper" with JSON:
      """
      {"goesOff": "2026-12-01"}
      """
    Then the response status is 200
    And the response JSON field "goesOff" is null

  Scenario: Used up part of a Lot lowers Stock and is not waste
    Given the Household holds 9 piece of the Supply "Toilet paper"
    When I use up 3 piece of the newest Lot of the Supply "Toilet paper"
    Then the Stock total of the Supply "Toilet paper" is 6
    And no waste is recorded

  Scenario: Used up the whole Lot empties it and is not waste
    Given the Household holds 9 piece of the Supply "Toilet paper"
    When I use up the whole newest Lot of the Supply "Toilet paper"
    Then the Stock total of the Supply "Toilet paper" is 0
    And no waste is recorded

  Scenario: An unknown barcode can be saved as a new Supply
    When I save the unknown barcode "5410091000097" at the Shop "Coop" as the new Supply "Dish soap" counted in ml with Product "Fairy 500 ml" of pack size 500 as Restock scan "scan-0002"
    Then Restock scan "scan-0002" was applied
    And the Ingredient "Dish soap" is a Supply
    And the Stock total of the Supply "Dish soap" is 500
