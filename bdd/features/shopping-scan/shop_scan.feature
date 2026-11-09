Feature: Scanning in a Shop
  A resolved barcode adds a Stock Lot, records the Product as sold at the Shop and a purchase, reduces the
  matching Shopping List line (ticking it at zero) and prefills the Price. Undo reverses it. The list line here
  is a manual extra of 1400 g passata, so these scenarios do not need a plan.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    And the shopping catalogue has the Product "Milk 1 l" of "milk" in ml with pack size 1000 and barcode "4000000000013"
    And "Mutti passata 700 g" costs 159 cents at "Coop"
    And I add the Shopping List extra of 1400 g of "passata"

  Scenario: A scan adds a Stock Lot, records the Product at the Shop and reduces the line
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" was applied
    And scan "scan-0001" added 700 g of "passata"
    And scan "scan-0001" is on the list with 700 g remaining
    And the shopping Stock has a Lot of 700 g of "passata" from "Coop" for "Mutti passata 700 g"
    And "Mutti passata 700 g" is sold at "Coop"
    And the last bought Product for "passata" is "Mutti passata 700 g"
    When I view the Shopping List at "Coop"
    Then the Shopping List extra "passata" still needs 700 g
    And the Shopping List line "passata" is not ticked

  Scenario: The scan that covers the line ticks it
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    And I scan the barcode "8000500310427" at "Coop" as scan "scan-0002"
    Then scan "scan-0001" did not tick the line
    And scan "scan-0002" ticked the line
    When I view the Shopping List at "Coop"
    Then the Shopping List line "passata" is ticked
    And the Shopping List is complete

  Scenario: The price is prefilled from the last Price at this Shop and can be edited
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" shows the price 159 cents
    When I change the price of scan "scan-0001" to 179 cents
    Then the response status is 200
    And the last Price of "Mutti passata 700 g" at "Coop" is 179 cents

  Scenario: An item that is not on the list is still added to Stock
    When I scan the barcode "4000000000013" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" was applied
    And scan "scan-0001" is not on the list
    And the shopping Stock total of "milk" is 1000 ml

  Scenario: Undo reverses the Lot, the purchase and the tick
    Given I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    And I scan the barcode "8000500310427" at "Coop" as scan "scan-0002"
    When I undo scan "scan-0002"
    Then the response status is 200
    And the shopping Stock total of "passata" is 700 g
    When I view the Shopping List at "Coop"
    Then the Shopping List line "passata" is not ticked
    And the Shopping List extra "passata" still needs 700 g
    When I undo scan "scan-0001"
    Then the shopping Stock total of "passata" is 0 g
    And "Mutti passata 700 g" is not sold at "Coop"
    And there is no last bought Product for "passata"

  Scenario: Undo twice is harmless
    Given I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    When I undo scan "scan-0001"
    And I undo scan "scan-0001"
    Then the response status is 200
    And the response JSON field "alreadyUndone" is true

  Scenario: Scanning the same client id twice adds one Lot
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    And I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" was a duplicate
    And the shopping Stock has 1 Lots of "passata"

  Scenario: The Shopping list complete celebration counts items, money and Lots
    Given I add the Shopping List extra "candles"
    And I tick the Shopping List extra "candles"
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    And I scan the barcode "8000500310427" at "Coop" as scan "scan-0002"
    And I view the Shopping List at "Coop"
    Then the Shopping List is complete
    And the Shopping List summary is 2 items, 318 cents spent and 2 Stock Lots added

  Scenario: A weighed barcode adds the decoded weight
    Given the shopping household has the Ingredient "carrots" in g
    And the shopping catalogue has the Product "Loose carrots" of "carrots" in g with pack size 1000 and no barcode
    And the Shop "Coop" has a weight rule with prefix "21" reading a weight in grams
    And the weight rule "21" of "Coop" knows "Loose carrots" as item "00005"
    When I scan the barcode "2100005007504" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" added 750 g of "carrots"

  Scenario: A price-valued rule asks for the weight once, then decodes it
    Given the shopping household has the Ingredient "cheese" in g
    And the shopping catalogue has the Product "Loose cheese" of "cheese" in g with pack size 1000 and no barcode
    And the Shop "Coop" has a weight rule with prefix "22" reading a price in cents
    And the weight rule "22" of "Coop" knows "Loose cheese" as item "00007"
    When I ask for the weight of "2200007002504" at "Coop" as scan "scan-0001" and say it weighs 500 g
    Then scan "scan-0001" added 500 g of "cheese"
    And scan "scan-0001" shows the price 250 cents
    When I scan the barcode "2200007002009" at "Coop" as scan "scan-0002"
    Then scan "scan-0002" added 400 g of "cheese"
