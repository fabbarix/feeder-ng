@b9-receipt
Feature: A receipt line that is already a Product is not made a second time (B9-50, SSP-08)
  The review's Add… offers the Products whose name matches the line. Using one sends the Add with that Product's id: the apply
  makes no Product and no Ingredient, scans the Product at the receipt's Price, and puts it back with the rest if a later step fails.
  The Product must exist and not be archived: otherwise the apply is refused (422 unknown_product, with the Add's id) before
  anything is written.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the receipt-apply household has the Shops "Coop" and "Esselunga"
    And the receipt-apply catalogue has the Product "Passata" in g with pack size 700
    And the receipt-apply catalogue has the Product "Kitchen roll 4 pack" in piece with pack size 4
    And I scan "Passata" at "Coop" at 129 cents as receipt-apply scan "a"
    And I scan "Passata" at "Coop" at 129 cents as receipt-apply scan "b"

  Scenario: Using an existing Product creates no new Product
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name         | packSize | packUnit |
      | -1  | 1     | 349   | Kitchen roll | 4        | piece    |
    And for the receipt-apply Add 0 I choose the existing Product "Kitchen roll 4 pack"
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0"
    Then the receipt-apply response status is 200
    And the receipt-apply catalogue has 1 Product named "Kitchen roll 4 pack"
    And the receipt-apply catalogue has 0 Products named "Kitchen roll"
    And the receipt-apply Stock has 3 Lots
    And the receipt-apply Shopping List shows 607 cents spent

  Scenario: The Product is scanned at the receipt's Price
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name         | packSize | packUnit |
      | -1  | 1     | 349   | Kitchen roll | 4        | piece    |
    And for the receipt-apply Add 0 I choose the existing Product "Kitchen roll 4 pack"
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0"
    Then the receipt-apply response status is 200
    And the latest receipt-apply Price of "Kitchen roll 4 pack" at "Coop" is 349 cents

  Scenario: Two packs on the receipt are two scans of the Product
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name         | packSize | packUnit |
      | -1  | 2     | 698   | Kitchen roll | 4        | piece    |
    And for the receipt-apply Add 0 I choose the existing Product "Kitchen roll 4 pack"
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0"
    Then the receipt-apply response status is 200
    And the receipt-apply Stock has 4 Lots
    And the latest receipt-apply Price of "Kitchen roll 4 pack" at "Coop" is 349 cents

  Scenario: A Product that does not exist is refused and nothing is written
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name         | packSize | packUnit |
      | -1  | 1     | 349   | Kitchen roll | 4        | piece    |
    And for the receipt-apply Add 0 I choose an existing Product that does not exist
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0"
    Then the receipt-apply response status is 422 with the error "unknown_product"
    And the receipt-apply response error names the proposal "add:0"
    And the receipt-apply Shopping List shows 258 cents spent
    And the receipt-apply Stock has 2 Lots

  Scenario: An archived Product is refused and nothing is written
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name         | packSize | packUnit |
      | -1  | 1     | 349   | Kitchen roll | 4        | piece    |
    And for the receipt-apply Add 0 I choose the existing Product "Kitchen roll 4 pack"
    And the receipt-apply Product "Kitchen roll 4 pack" is archived
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0"
    Then the receipt-apply response status is 422 with the error "unknown_product"
    And the receipt-apply response error names the proposal "add:0"
    And the receipt-apply Shopping List shows 258 cents spent
    And the receipt-apply Stock has 2 Lots

  Scenario: A failure after an Add of an existing Product puts that Add back too
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name         | packSize | packUnit |
      | -1  | 1     | 349   | Kitchen roll | 4        | piece    |
      | -1  | 1     | 100   | Spaghetti    | 500      | g        |
    And for the receipt-apply Add 0 I choose the existing Product "Kitchen roll 4 pack"
    And for the receipt-apply Add 1 I choose an Ingredient that does not exist and the Product "Spaghetti" of pack size 500
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0", "add:1"
    Then the receipt-apply response status is 500 with the error "receipt_apply_failed"
    And the receipt-apply Shopping List shows 258 cents spent
    And the receipt-apply Stock has 2 Lots
    And the receipt-apply catalogue has 0 Products named "Spaghetti"
