Feature: Two shoppers
  Two people shopping the same list see each other's ticks within about a second: every write publishes a
  Shopping List event before it answers, and a second client's list already shows the change.

  Background:
    Given a running Feeder
    And "partner@example.test" is on the allowlist
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    And I add the Shopping List extra of 700 g of "passata"

  Scenario: A scan by one shopper reaches the other
    Given shopper "partner@example.test" is listening for Shopping List updates
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    Then shopper "partner@example.test" hears of the change within 1 second
    When I am signed in as "partner@example.test"
    And I view the Shopping List at "Coop"
    Then the Shopping List line "passata" is ticked

  Scenario: A tick by hand reaches the other shopper
    Given shopper "partner@example.test" is listening for Shopping List updates
    When I tick the Shopping List extra "passata"
    Then shopper "partner@example.test" hears of the change within 1 second

  Scenario: Both shoppers' scans count towards the same line
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    And I am signed in as "partner@example.test"
    And I scan the barcode "8000500310427" at "Coop" as scan "scan-0002"
    Then scan "scan-0001" ticked the line
    And scan "scan-0002" did not tick the line
    And the shopping Stock has 2 Lots of "passata"
    And the shopping Stock total of "passata" is 1400 g
