@b9-scan-data
Feature: Scan data: weighed codes and codes of a Shop without a rule (B9-41: SSP-07, SSP-15)
  The API half of two Scan screen flows. A new weighed Product is priced per kg from the keypad, and the server keeps the
  Price per kg with the Price. A code that looks like a weighed-goods code (in-store prefix 20 to 29) at a Shop with no
  Weight Barcode Rule is simply unknown to the server: the screen says so from the Shop's (empty) list of rules, and once
  the rule exists the same code is read as weighed.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has the Ingredient "cheese" in g

  # SSP-07: the keypad opens on per kg for the new weighed row; this is what it saves.
  Scenario: A new weighed Product is priced per kg
    Given the Shop "Coop" has a weight rule with prefix "20" reading a weight in grams
    When I name the unknown weighed code "2000123003122" at "Coop" as scan "w1" with Ingredient "cheese" and Product name "Loose cheese"
    Then scan "w1" was applied
    And scan "w1" added 312 g of "cheese"
    When I price the weighed scan "w1" at 465 cents and 1490 cents per kg
    Then the response status is 200
    And the latest Price of the Product "Loose cheese" at "Coop" is 465 cents and 1490 cents per kg

  # SSP-15: the hint needs "the Shop has no Weight Barcode Rule" and "the code is unknown".
  Scenario: A weighed-goods code at a Shop without a rule says so
    Given the Shop "Coop" has no weight rules
    Then the barcode "2100123012503" is unknown at "Coop"

  Scenario: Once the Shop has the rule the same code is a weighed code, not an unknown one
    Given the Shop "Coop" has a weight rule with prefix "21" reading a weight in grams
    Then the Shop "Coop" has 1 weight rule
    And the weight-style barcode "2100123012503" is not unknown at "Coop"
