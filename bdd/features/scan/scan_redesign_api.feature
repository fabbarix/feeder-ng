Feature: The Scanned list's Price edits (scan redesign API, SR1)
  On the redesigned Scan screen a row groups every scan of one Product at this Shop. Pricing the row is one request,
  PATCH /api/scan/prices, which gives each of its scans the Price. A Product in g or ml can also be priced per kg or
  per l; a Product in pieces has a Price per pack only. The offline data says when the last Price was recorded.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the redesign household has the Shops "Coop" and "Esselunga"
    And the redesign catalogue has the Product "Fusilli" in g with pack size 500
    And the redesign catalogue has the Product "Orange juice" in ml with pack size 1000
    And the redesign catalogue has the Product "Eggs" in piece with pack size 6

  Scenario: One Price for every scan of a row
    Given I scan "Fusilli" at "Coop" without a Price as redesign scan "s1"
    And I scan "Fusilli" at "Coop" without a Price as redesign scan "s2"
    And I scan "Fusilli" at "Coop" without a Price as redesign scan "s3"
    When I set the redesign price of scans "s1", "s2", "s3" to 129 cents
    Then the redesign response status is 200
    And the redesign response prices "s1" at 129 cents
    And the redesign response prices "s3" at 129 cents
    And the redesign Shopping List shows 387 cents spent
    And the latest redesign Price of "Fusilli" at "Coop" is 129 cents

  Scenario: Setting the same Price again changes nothing
    Given I scan "Fusilli" at "Coop" without a Price as redesign scan "s1"
    And I scan "Fusilli" at "Coop" without a Price as redesign scan "s2"
    When I set the redesign price of scans "s1", "s2" to 129 cents
    And I set the redesign price of scans "s1", "s2" to 129 cents
    Then the redesign response status is 200
    And the redesign Shopping List shows 258 cents spent
    And "Fusilli" has 1 redesign Price at "Coop"

  Scenario: A Price per kg prices each scan by its weight
    Given I scan "Fusilli" at "Coop" without a Price as redesign scan "pack"
    And I scan "Fusilli" at "Coop" weighing 312 g without a Price as redesign scan "weighed"
    When I set the redesign price of scans "pack", "weighed" to 1000 cents and 2000 cents per kg
    Then the redesign response prices "pack" at 1000 cents
    And the redesign response prices "weighed" at 624 cents
    And the redesign Shopping List shows 1624 cents spent
    And the latest redesign Price of "Fusilli" at "Coop" is 1000 cents and 2000 cents per kg

  Scenario: A single scan takes a Price per kg too
    Given I scan "Fusilli" at "Coop" weighing 450 g without a Price as redesign scan "weighed"
    When I set the redesign price of scan "weighed" to 899 cents and 899 cents per kg
    Then the redesign response status is 200
    And the redesign response prices "weighed" at 405 cents

  Scenario: A Price per l for a Product in ml
    Given I scan "Orange juice" at "Coop" without a Price as redesign scan "j1"
    When I set the redesign price of scan "j1" to 300 cents and 300 cents per kg
    Then the redesign response prices "j1" at 300 cents

  Scenario: A Product in pieces has a Price per pack only
    Given I scan "Eggs" at "Coop" without a Price as redesign scan "e1"
    When I set the redesign price of scan "e1" to 320 cents and 500 cents per kg
    Then the redesign response status is 422
    And the redesign response error is "validation_failed"
    And the redesign Shopping List shows 0 cents spent
    When I set the redesign price of scans "e1" to 320 cents
    Then the redesign response status is 200
    And the redesign Shopping List shows 320 cents spent

  Scenario: A scan the server does not know, such as one still waiting to sync, is refused
    Given I scan "Fusilli" at "Coop" without a Price as redesign scan "s1"
    When I set the redesign price of scans "s1", "queued-on-the-phone" to 129 cents
    Then the redesign response status is 404
    And the redesign response error is "not_found"
    And the redesign Shopping List shows 0 cents spent

  Scenario: Scans of two Shops are not one row
    Given I scan "Fusilli" at "Coop" without a Price as redesign scan "s1"
    And I scan "Fusilli" at "Esselunga" without a Price as redesign scan "s2"
    When I set the redesign price of scans "s1", "s2" to 129 cents
    Then the redesign response status is 422
    And the redesign response error is "validation_failed"
    And the redesign Shopping List shows 0 cents spent

  Scenario: An undone scan cannot be priced
    Given I scan "Fusilli" at "Coop" without a Price as redesign scan "s1"
    And I scan "Fusilli" at "Coop" without a Price as redesign scan "s2"
    And I undo the redesign scan "s2"
    When I set the redesign price of scans "s1", "s2" to 129 cents
    Then the redesign response status is 409
    And the redesign response error is "already_undone"
    And the redesign Shopping List shows 0 cents spent

  Scenario: The offline data says when the last Price was recorded
    Given I scan "Fusilli" at "Coop" without a Price as redesign scan "s1"
    And I set the redesign price of scan "s1" to 129 cents
    And "Eggs" has a redesign Price of 290 cents at "Coop" on 2026-11-02
    Then the redesign offline data for "Coop" lists "Fusilli" with the last Price 129 cents of today
    And the redesign offline data for "Coop" lists "Eggs" with the last Price 290 cents of 2026-11-02
    And the redesign offline data for "Coop" lists "Orange juice" without a last Price
    And the redesign offline data for "Esselunga" lists "Fusilli" without a last Price
