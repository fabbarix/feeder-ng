Feature: Applying a receipt (receipt reading, RR3)
  After the assistant has read a receipt, the Member checks the proposals and applies them. The server recomputes the
  fingerprint of the Scanned list from the scans the phone holds now, and writes nothing when it is not the one the
  receipt was read against. The accepted proposals run as one plan under the scan lock; when a step fails, every step
  already done is put back.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the receipt-apply household has the Shops "Coop" and "Esselunga"
    And the receipt-apply catalogue has the Product "Passata" in g with pack size 700
    And I scan "Passata" at "Coop" at 129 cents as receipt-apply scan "a"
    And I scan "Passata" at "Coop" at 129 cents as receipt-apply scan "b"

  Scenario: Accepted Prices are applied to every scan of the row
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name | packSize | packUnit |
      | 0   | 2     | 270   |      |          |          |
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "price:0"
    Then the receipt-apply response status is 200
    And the receipt-apply response applied 1 proposal and returned 2 results
    And the receipt-apply Shopping List shows 270 cents spent
    And the latest receipt-apply Price of "Passata" at "Coop" is 135 cents

  Scenario: A scan since the read refuses the apply and writes nothing
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name | packSize | packUnit |
      | 0   | 2     | 270   |      |          |          |
    And I scan "Passata" at "Coop" at 129 cents as receipt-apply scan "c"
    When I apply the receipt-apply read "r1" for the scans "a", "b", "c" accepting "price:0"
    Then the receipt-apply response status is 409 with the error "receipt_session_changed"
    And the receipt-apply Shopping List shows 387 cents spent

  Scenario: A Price edited since the read refuses the apply
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name | packSize | packUnit |
      | 0   | 2     | 270   |      |          |          |
    And I change the receipt-apply Price of the scans "a", "b" to 140 cents
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "price:0"
    Then the receipt-apply response status is 409 with the error "receipt_session_changed"
    And the receipt-apply Shopping List shows 280 cents spent

  Scenario: Change Shop ends the session, so the apply is refused
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name | packSize | packUnit |
      | 0   | 2     | 270   |      |          |          |
    When I apply the receipt-apply read "r1" for the scans "" accepting "price:0"
    Then the receipt-apply response status is 409 with the error "receipt_session_changed"
    And the receipt-apply Shopping List shows 258 cents spent

  Scenario: The next day ends the session too
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name | packSize | packUnit |
      | 0   | 2     | 270   |      |          |          |
    And the receipt-apply day passes
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "price:0"
    Then the receipt-apply response status is 409 with the error "receipt_session_changed"

  Scenario: A read that is gone cannot be applied
    When I apply the receipt-apply read "nothing" for the scans "a", "b" accepting "price:0"
    Then the receipt-apply response status is 410 with the error "receipt_read_gone"

  Scenario: An accepted id that is not a proposal is refused before anything is written
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name | packSize | packUnit |
      | 0   | 2     | 270   |      |          |          |
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "price:0", "price:9"
    Then the receipt-apply response status is 422 with the error "unknown_proposal"
    And the receipt-apply Shopping List shows 258 cents spent

  Scenario: A line that is not on the Scanned list is added as a Supply
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name       | packSize | packUnit |
      | -1  | 1     | 299   | Fairy soap | 1        | piece    |
    And for the receipt-apply Add 0 I choose the new supply Ingredient "dish soap" in piece and the Product "Fairy soap" of pack size 1
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0"
    Then the receipt-apply response status is 200
    And the receipt-apply catalogue has 1 Product named "Fairy soap"
    And the receipt-apply Ingredient "dish soap" is a supply
    And the receipt-apply Stock has 3 Lots

  Scenario: A line that is not on the Scanned list is added as a food
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name           | packSize | packUnit |
      | -1  | 1     | 225   | Pane casereccio | 450      | g        |
    And for the receipt-apply Add 0 I choose the new food Ingredient "bread" in g and the Product "Pane casereccio" of pack size 450
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0"
    Then the receipt-apply response status is 200
    And the receipt-apply Ingredient "bread" is a food

  Scenario: Retrying an apply with an Add does not add it twice
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name       | packSize | packUnit |
      | -1  | 1     | 299   | Fairy soap | 1        | piece    |
    And for the receipt-apply Add 0 I choose the new supply Ingredient "dish soap" in piece and the Product "Fairy soap" of pack size 1
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0"
    And I apply the receipt-apply read "r1" for the scans "a", "b" accepting "add:0"
    Then the receipt-apply response status is 200
    And the receipt-apply catalogue has 1 Product named "Fairy soap"
    And the receipt-apply Stock has 3 Lots

  Scenario: A name correction renames the Product
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name                      | packSize | packUnit |
      | 0   | 2     | 258   | Passata di pomodoro Mutti |          |          |
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "name:0"
    Then the receipt-apply response status is 200
    And the receipt-apply catalogue has 1 Product named "Passata di pomodoro Mutti"
    And the receipt-apply catalogue has 0 Products named "Passata"

  Scenario: A failure half way puts back every step already done
    Given a receipt-apply read "r1" of the scans "a", "b" at "Coop" with the lines
      | row | count | price | name       | packSize | packUnit |
      | 0   | 2     | 270   |            |          |          |
      | -1  | 1     | 299   | Fairy soap | 1        | piece    |
      | -1  | 1     | 100   | Spaghetti  | 500      | g        |
    And for the receipt-apply Add 1 I choose the new supply Ingredient "dish soap" in piece and the Product "Fairy soap" of pack size 1
    And for the receipt-apply Add 2 I choose an Ingredient that does not exist and the Product "Spaghetti" of pack size 500
    When I apply the receipt-apply read "r1" for the scans "a", "b" accepting "price:0", "add:1", "add:2"
    Then the receipt-apply response status is 500 with the error "receipt_apply_failed"
    And the receipt-apply Shopping List shows 258 cents spent
    And the latest receipt-apply Price of "Passata" at "Coop" is 129 cents
    And the receipt-apply catalogue has 0 Products named "Fairy soap"
    And the receipt-apply catalogue has 0 Products named "Spaghetti"
    And the receipt-apply Stock has 2 Lots
