@area-shopping-scan
Feature: Stock-take scanning
  The same scanner without a Shop. Each scan opens a sheet with +1 pack, -1 pack and Set total. It never touches
  the Shopping List and only global barcodes apply.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    And I add the Shopping List extra of 1400 g of "passata"

  Scenario: Plus one pack adds a Stock Lot of one pack
    When I scan the barcode "8000500310427" at home and choose "plus_pack" as scan "take-0001"
    Then scan "take-0001" was applied
    And the shopping Stock total of "passata" is 700 g
    And the shopping Stock has a Lot of 700 g of "passata" from no Shop for "Mutti passata 700 g"

  Scenario: Minus one pack removes a pack and never goes below zero
    Given I scan the barcode "8000500310427" at home and choose "plus_pack" as scan "take-0001"
    When I scan the barcode "8000500310427" at home and choose "minus_pack" as scan "take-0002"
    Then the shopping Stock total of "passata" is 0 g
    When I scan the barcode "8000500310427" at home and choose "minus_pack" as scan "take-0003"
    Then the shopping Stock total of "passata" is 0 g

  Scenario: Set total corrects Stock
    When I scan the barcode "8000500310427" at home and choose "set_total" with total 1500 as scan "take-0001"
    Then the shopping Stock total of "passata" is 1500 g
    And scan "take-0001" leaves 1500 g in total

  Scenario: Stock-take leaves the Shopping List alone and records no purchase
    When I scan the barcode "8000500310427" at home and choose "plus_pack" as scan "take-0001"
    And I view the Shopping List
    Then the Shopping List extra "passata" still needs 1400 g
    And there is no last bought Product for "passata"

  # B9-05 (SAFE-09): Stock-take is no longer the one scan that cannot be undone.
  @b9-stock-undo
  Scenario: +1 pack in Stock-take can be undone
    Given I scan the barcode "8000500310427" at home and choose "plus_pack" as scan "take-0001"
    When I undo scan "take-0001"
    Then the response status is 200
    And the shopping Stock total of "passata" is 0 g
    And the shopping Stock has 0 Lots of "passata"
    When I view the Shopping List
    Then the Shopping List extra "passata" still needs 1400 g

  @b9-stock-undo
  Scenario: -1 pack in Stock-take can be undone
    Given I scan the barcode "8000500310427" at home and choose "set_total" with total 1500 as scan "take-0001"
    And I scan the barcode "8000500310427" at home and choose "minus_pack" as scan "take-0002"
    And the shopping Stock total of "passata" is 800 g
    When I undo scan "take-0002"
    Then the response status is 200
    And the shopping Stock total of "passata" is 1500 g

  @b9-stock-undo
  Scenario: A -1 pack that found less than a pack gives back only what was there
    Given I scan the barcode "8000500310427" at home and choose "set_total" with total 500 as scan "take-0001"
    And I scan the barcode "8000500310427" at home and choose "minus_pack" as scan "take-0002"
    And the shopping Stock total of "passata" is 0 g
    When I undo scan "take-0002"
    Then the shopping Stock total of "passata" is 500 g

  @b9-stock-undo
  Scenario: Set total can be undone, up or down
    Given I scan the barcode "8000500310427" at home and choose "set_total" with total 1500 as scan "take-0001"
    And I scan the barcode "8000500310427" at home and choose "set_total" with total 400 as scan "take-0002"
    When I undo scan "take-0002"
    Then the shopping Stock total of "passata" is 1500 g
    When I undo scan "take-0001"
    Then the shopping Stock total of "passata" is 0 g

  @b9-stock-undo
  Scenario: Undoing a Stock-take twice changes nothing more
    Given I scan the barcode "8000500310427" at home and choose "set_total" with total 1500 as scan "take-0001"
    And I scan the barcode "8000500310427" at home and choose "minus_pack" as scan "take-0002"
    When I undo scan "take-0002"
    And I undo scan "take-0002"
    Then the response status is 200
    And the shopping Stock total of "passata" is 1500 g
