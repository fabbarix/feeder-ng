Feature: Price entry from the Scanned list (scan redesign, SR6)
  A row is priced from the keypad: one Price for every scan of the row, per pack, or per kg for a Product in g or ml. A
  Price the server refuses changes nothing. A phone that is offline sends the Price with the scan, and a replay sends
  it again without adding anything.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Fusilli 500 g" of "pasta" in g with pack size 500 and barcode "8000500310427"

  Scenario: A Price per pack applies to every scan of the row and is the Price here next time
    Given I scan the Product "Fusilli 500 g" at "Coop" as list scan "s1"
    And I scan the Product "Fusilli 500 g" at "Coop" as list scan "s2"
    When I price the list scans "s1", "s2" at 129 cents
    Then the response status is 200
    And the redesign Shopping List shows 258 cents spent
    And the list Price of "Fusilli 500 g" at "Coop" is 129 cents
    When I scan the Product "Fusilli 500 g" at "Coop" as list scan "s3"
    Then scan "s3" shows the price 129 cents

  Scenario: A Price per kg prices a weighed scan by its weight
    Given I scan the Product "Fusilli 500 g" at "Coop" weighing 312 g as list scan "w1"
    When I price the list scans "w1" at 1000 cents and 2000 cents per kg
    Then the response status is 200
    And the redesign Shopping List shows 624 cents spent
    And the list Price of "Fusilli 500 g" at "Coop" is 1000 cents and 2000 cents per kg

  Scenario: Pricing a row again replaces the Price and keeps one for the day
    Given I scan the Product "Fusilli 500 g" at "Coop" as list scan "s1"
    And I price the list scans "s1" at 129 cents
    When I price the list scans "s1" at 135 cents
    Then the response status is 200
    And the redesign Shopping List shows 135 cents spent
    And the list Price of "Fusilli 500 g" at "Coop" is 135 cents

  Scenario Outline: A Price the server refuses changes nothing
    Given I scan the Product "Fusilli 500 g" at "Coop" at 129 cents as list scan "s1"
    When I price the list scans "s1" at <price> cents
    Then the response status is 422
    And the error code is "validation_failed"
    And the redesign Shopping List shows 129 cents spent
    And the list Price of "Fusilli 500 g" at "Coop" is 129 cents

    Examples:
      | price |
      | 0     |
      | -50   |

  Scenario: An offline Price, per pack and per kg, is replayed once
    Given the phone caches the offline data for "Coop"
    And the phone queues the Product "Fusilli 500 g" at "Coop" at 129 cents as "q1"
    And the phone queues the Product "Fusilli 500 g" at "Coop" weighing 312 g at 624 cents and 2000 cents per kg as "q2"
    When the phone syncs its queue
    Then the sync results are "applied, applied"
    And the redesign Shopping List shows 753 cents spent
    When the phone syncs its queue
    Then the sync results are "duplicate, duplicate"
    And the redesign Shopping List shows 753 cents spent
    And the shopping Stock has 2 Lots of "pasta"

  Scenario: A scan still waiting to sync has no Price on the server to edit
    Given I scan the Product "Fusilli 500 g" at "Coop" as list scan "s1"
    When I price the list scans "s1", "queued-on-the-phone" at 129 cents
    Then the response status is 404
    And the error code is "not_found"
    And the redesign Shopping List shows 0 cents spent
