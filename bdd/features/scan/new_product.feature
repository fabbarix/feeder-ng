Feature: A new Product from the Scan screen (scan redesign, SR6)
  An unknown barcode opens the short "What is this?" sheet. Saving it sends one scan Op, shop_unknown: a Line picked from
  the list gives the Ingredient or Supply it is of, and "Something else" names a new one. The pack size is the one thing
  that must be given; the Price and the name can wait. A phone that is offline sends the same Op when it syncs.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: A new Product of a new Supply
    Given the shopping household has a Shop "Coop"
    When I save the unknown barcode "5410091000097" at "Coop" as list scan "n1" for the new supply Ingredient "Dish soap" counted in ml with Product "Fairy 500 ml" of pack size 500
    Then scan "n1" was applied
    And scan "n1" created the Product "Fairy 500 ml"
    And list scan "n1" has ingredient kind "supply"
    And the Ingredient "Dish soap" is a Supply
    And the shopping Stock total of "Dish soap" is 500 ml
    And the barcode "5410091000097" resolves to "Fairy 500 ml" at "Coop"

  Scenario: A new Product of a new food Ingredient
    Given the shopping household has a Shop "Coop"
    When I save the unknown barcode "4000000000037" at "Coop" as list scan "n1" for the new food Ingredient "Rice" counted in g with Product "Basmati 1 kg" of pack size 1000
    Then scan "n1" was applied
    And list scan "n1" has ingredient kind "food"
    And the shopping Stock total of "Rice" is 1000 g

  Scenario: Picking a Line gives the Ingredient, and the new Product ticks it
    Given the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    And I add the Shopping List extra of 700 g of "passata"
    When I save the unknown barcode "5012345678900" at "Coop" as list scan "n1" for the existing Ingredient "passata" with Product "Cirio passata 700 g" of pack size 700
    Then scan "n1" was applied
    And scan "n1" is on the list with 0 g remaining
    And scan "n1" ticked the line
    And there is exactly 1 Ingredient named "passata"

  Scenario: Picking the Restock Line of a Supply gives the Supply, and the new Product ticks it
    Given the Household has the Shop "Coop" for Supplies
    And the Household has the Supply "Toilet paper" counted in piece with a Restock level of 9
    And the Household holds 2 piece of the Supply "Toilet paper"
    When I save the unknown barcode "5410091000004" at "Coop" as list scan "n1" for the existing Ingredient "Toilet paper" with Product "Lotus 9 rolls" of pack size 9
    Then scan "n1" was applied
    And list scan "n1" has ingredient kind "supply"
    And the Stock total of the Supply "Toilet paper" is 11

  Scenario: The pack size is the one thing that must be given
    Given the shopping household has a Shop "Coop"
    When I save the unknown barcode "5410091000097" at "Coop" as list scan "n1" for the new supply Ingredient "Dish soap" counted in ml with Product "Fairy" of pack size 0
    Then list scan "n1" was rejected
    And there is exactly 0 Product named "Fairy"
    And there is exactly 0 Ingredient named "Dish soap"

  Scenario: A new Supply made on the phone offline is created once on sync
    Given the shopping household has a Shop "Coop"
    And the phone queues the unknown barcode "5410091000097" at "Coop" as "q1" for the new supply "Dish soap" counted in ml with Product "Fairy 500 ml" of pack size 500
    When the phone syncs its queue
    Then the sync results are "applied"
    And scan "q1" created the Product "Fairy 500 ml"
    And the Ingredient "Dish soap" is a Supply
    When the phone syncs its queue
    Then the sync results are "duplicate"
    And there is exactly 1 Product named "Fairy 500 ml"
    And the shopping Stock has 1 Lots of "Dish soap"
