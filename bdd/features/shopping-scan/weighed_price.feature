Feature: A weighed barcode is priced by weight
  Scanning a weight-valued barcode (Weight Barcode Rule 21) charges the decoded weight at the Product's price
  per kg, rounded half up to the cent, never the pack Price. A price-valued barcode keeps the price it carries.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has the Ingredient "carrots" in g
    And the shopping catalogue has the Product "Rule 21 Product" of "carrots" in g with pack size 1000 and no barcode
    And the Shop "Coop" has a weight rule with prefix "21" reading a weight in grams
    And the weight rule "21" of "Coop" knows "Rule 21 Product" as item "12345"
    And "Rule 21 Product" has a Price of 899 cents at "Coop"

  Scenario: 850 g of a 1 kg Product at 8.99 costs 7.64
    When I scan the barcode "2112345008509" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" added 850 g of "carrots"
    And scan "scan-0001" shows the price 764 cents
    And the last Price of "Rule 21 Product" at "Coop" is 764 cents

  Scenario: 450 g costs 4.05 (404.55 cents rounds up)
    When I scan the barcode "2112345004501" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" added 450 g of "carrots"
    And scan "scan-0001" shows the price 405 cents

  Scenario: Editing the price afterwards still works
    When I scan the barcode "2112345008509" at "Coop" as scan "scan-0001"
    And I change the price of scan "scan-0001" to 700 cents
    Then the response status is 200
    And the last Price of "Rule 21 Product" at "Coop" is 700 cents

  Scenario: A price-valued barcode keeps the price it carries
    Given the shopping catalogue has the Product "Loose cheese" of "carrots" in g with pack size 1000 and no barcode
    And the Shop "Coop" has a weight rule with prefix "22" reading a price in cents
    And the weight rule "22" of "Coop" knows "Loose cheese" as item "00007"
    When I ask for the weight of "2200007002504" at "Coop" as scan "scan-0002" and say it weighs 500 g
    And I scan the barcode "2200007002009" at "Coop" as scan "scan-0003"
    Then scan "scan-0003" added 400 g of "carrots"
    And scan "scan-0003" shows the price 200 cents
