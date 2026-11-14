Feature: The Scanned list (scan redesign, SR6)
  The Scanned list on the Scan screen is a list of rows, one per Product at this Shop. What a row says comes from the
  scans: how much of its Line the scans cover (the "x of y" tick), what was spent, and whether the Product is a Supply.
  Remove is an Undo of the row's scans, and Put back is a new scan. Change Shop starts a new list, so the Prices of one
  Shop never touch another's.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has a Shop "Esselunga"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    And the shopping catalogue has the Product "Milk 1 l" of "milk" in ml with pack size 1000 and barcode "4000000000013"
    And the shopping catalogue has the Product "Eggs 6" of "eggs" in piece with pack size 6 and barcode "4000000000020"
    And I add the Shopping List extra of 1400 g of "passata"

  Scenario: A row covers its Line scan by scan
    When I scan the Product "Mutti passata 700 g" at "Coop" as list scan "l1"
    Then scan "l1" is on the list with 700 g remaining
    And scan "l1" did not tick the line
    When I scan the Product "Mutti passata 700 g" at "Coop" as list scan "l2"
    Then scan "l2" is on the list with 0 g remaining
    And scan "l2" ticked the line

  Scenario: A pack bigger than the Line still ticks it
    Given I add the Shopping List extra of 300 ml of "milk"
    When I scan the Product "Milk 1 l" at "Coop" as list scan "m1"
    Then scan "m1" is on the list with 0 ml remaining
    And scan "m1" ticked the line

  Scenario: A Product that is not on the list is a row with no Line
    When I scan the Product "Eggs 6" at "Coop" as list scan "e1"
    Then scan "e1" was applied
    And scan "e1" is not on the list
    And the shopping Stock total of "eggs" is 6 piece

  Scenario: Remove takes every scan of the row back
    Given I scan the Product "Mutti passata 700 g" at "Coop" at 129 cents as list scan "l1"
    And I scan the Product "Mutti passata 700 g" at "Coop" at 129 cents as list scan "l2"
    When I remove list scan "l2"
    And I remove list scan "l1"
    Then the shopping Stock total of "passata" is 0 g
    And the list spent is 0 cents
    When I view the Shopping List at "Coop"
    Then the Shopping List line "passata" is not ticked
    And the Shopping List extra "passata" still needs 1400 g

  Scenario: Put back is a new scan
    Given I scan the Product "Mutti passata 700 g" at "Coop" at 129 cents as list scan "l1"
    And I remove list scan "l1"
    When I scan the Product "Mutti passata 700 g" at "Coop" at 129 cents as list scan "l1-back"
    Then scan "l1-back" was applied
    And the shopping Stock has 1 Lots of "passata"
    And the list spent is 129 cents

  Scenario: Remove keeps the Price and the Shop link the Product had before
    Given "Mutti passata 700 g" has a Price of 159 cents at "Coop"
    And "Mutti passata 700 g" is sold at "Coop"
    And I scan the Product "Mutti passata 700 g" at "Coop" at 179 cents as list scan "l1"
    When I remove list scan "l1"
    Then the shopping Stock total of "passata" is 0 g
    And "Mutti passata 700 g" is sold at "Coop"
    And the list Price of "Mutti passata 700 g" at "Coop" is 159 cents

  Scenario: Change Shop starts a new list, so Prices stay with their Shop
    Given I scan the Product "Mutti passata 700 g" at "Coop" as list scan "c1"
    And I scan the Product "Mutti passata 700 g" at "Esselunga" as list scan "e1"
    When I price the list scans "c1" at 129 cents
    Then the list response status is 200
    And the list Price of "Mutti passata 700 g" at "Coop" is 129 cents
    And the list has no Price of "Mutti passata 700 g" at "Esselunga"
    And the list spent is 129 cents

  Scenario: An offline queue replays into the same rows and twice changes nothing
    Given the phone caches the offline data for "Coop"
    And the phone queues the Product "Mutti passata 700 g" at "Coop" at 129 cents as "q1"
    And the phone queues the Product "Mutti passata 700 g" at "Coop" at 129 cents as "q2"
    When the phone syncs its queue
    Then the sync results are "applied, applied"
    And scan "q2" ticked the line
    When the phone syncs its queue
    Then the sync results are "duplicate, duplicate"
    And the shopping Stock has 2 Lots of "passata"
    And the list spent is 258 cents
