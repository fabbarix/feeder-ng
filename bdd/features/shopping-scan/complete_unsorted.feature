@b9-shop-line-sheet
Feature: A complete Shopping List knows which of its Stock Lots are Not sorted (beta.9, B9-43, SSP-09, API half)
  The "Shopping List complete" tile offers "Put away N Stock Lots" when some Stock Lots this shop added are Not sorted
  into a Storage Place. What the tile draws is UI; what it counts is the Stock the shop leaves behind: a first purchase
  of an Ingredient, in a Household with no default Storage Place, is Not sorted, and Put away sorts it. Money, Lines and
  Lots are the summary the tile's rows read.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    And "Mutti passata 700 g" has a Price of 159 cents at "Coop"
    And Stock knows the shopping Ingredient "passata"
    And I add the Shopping List extra of 700 g of "passata"

  Scenario: A first purchase with no default Storage Place leaves its Stock Lot Not sorted
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    And I view the Shopping List at "Coop"
    Then the Shopping List is complete
    And the Shopping List summary is 1 lines, 159 cents spent and 1 Stock Lots added
    And the Stock Lot of "passata" is not in any Storage Place

  Scenario: Put away sorts it, so the complete tile has nothing left to put away
    Given the Household keeps food in the pantry "Kitchen Pantry"
    And I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    When I put away the Stock Lot of "passata" into the "Kitchen Pantry"
    Then the response status is 200
    And the Stock Lot of "passata" is in the "Kitchen Pantry"
