@area-shopping-scan
Feature: Ticks made offline sync with the Scans (beta.9, RES-03)
  A tick by hand made offline is queued like a Scan and sent with it, in the order it was made. A retried sync never adds
  a second Stock Lot. A queued tick that syncs after someone else ticked the Line always adds its own Stock Lot, and the
  answer says who ticked before. A tick for a Line that left the list is refused. These scenarios cover the API half of
  RES-03; the queue itself (Undo and Change while a tick waits, the pending row, the banner) and the Scan screen opened
  offline are covered by the web tests of the queue and the Shop screen. Monday 2026-11-09 12:00 UTC.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And "partner@example.test" is on the allowlist
    And the shopping household has a Shop "Coop"
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 1 days ahead
    And the shopping household has the Ingredient "chicken thighs" in g
    And the shopping household has the Ingredient "salt" in g
    And the shopping Recipes:
      | name             | yield | needs                  |
      | chicken traybake | 2     | 400 g chicken thighs   |
    And the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 1       |

  Scenario: Ticking by hand offline adds the last-bought pack when it syncs
    Given the phone queues a tick of "chicken thighs" for 500 g covering 400 g as "tick-1"
    When the phone syncs its queue
    Then the sync results are "applied"
    And the shopping Stock total of "chicken thighs" is 500 g
    And the line "chicken thighs" says it added 500 g to Stock
    And the line "chicken thighs" was ticked by hand

  Scenario: A retried sync never adds a third Stock Lot
    Given the phone queues a tick of "chicken thighs" for 500 g covering 400 g as "tick-1"
    When the phone syncs its queue
    And the phone syncs its queue
    And the phone syncs its queue
    Then the sync results are "duplicate"
    And the shopping Stock has 1 Lots of "chicken thighs"
    And the line "chicken thighs" has 1 additions

  Scenario: Ticks made offline sync in order when the phone is back online
    Given the phone queues a tick of "chicken thighs" for 500 g covering 400 g as "tick-1"
    And the phone queues an untick of the tick "tick-1" as "untick-1"
    And the phone queues a tick of "chicken thighs" for 200 g covering 400 g as "tick-2"
    When the phone syncs its queue
    Then the sync results are "applied, applied, applied"
    And the shopping Stock total of "chicken thighs" is 200 g
    And the shopping Stock has 1 Lots of "chicken thighs"

  Scenario: A Line the other shopper already ticked keeps both Stock Lots
    Given I am signed in as "partner@example.test"
    And I tick "chicken thighs" with 400 g as tick "online-1"
    And I am signed in as the User
    And the phone queues a tick of "chicken thighs" for 50 g covering 400 g as "tick-1"
    When the phone syncs its queue
    Then tick "tick-1" was applied
    And tick "tick-1" says "partner" had also ticked it for 400 g
    And the shopping Stock has 2 Lots of "chicken thighs"
    And the line "chicken thighs" has 2 additions
    And the line "chicken thighs" was ticked by hand

  Scenario: A Line this User also ticked on another phone keeps both Stock Lots and names the User's own tick
    Given I tick "chicken thighs" with 400 g as tick "online-1"
    And the phone queues a tick of "chicken thighs" for 50 g covering 400 g as "tick-1"
    When the phone syncs its queue
    Then tick "tick-1" was applied
    And tick "tick-1" names my own earlier tick of 400 g
    And the shopping Stock has 2 Lots of "chicken thighs"
    And the line "chicken thighs" has 2 additions

  Scenario: Take mine back removes only my Stock Lot
    Given I am signed in as "partner@example.test"
    And I tick "chicken thighs" with 400 g as tick "online-1"
    And I am signed in as the User
    And the phone queues a tick of "chicken thighs" for 50 g covering 400 g as "tick-1"
    And the phone syncs its queue
    When I take back what I added to "chicken thighs"
    Then the shopping Stock total of "chicken thighs" is 400 g
    And the line "chicken thighs" has 2 additions

  Scenario: A Tick refused on sync adds no Stock and says why
    Given the phone queues a tick of "salt" for 100 g covering 100 g as "tick-1"
    When the phone syncs its queue
    Then the sync results are "rejected"
    And tick "tick-1" was rejected with "not_on_list"
    And the shopping Stock has 0 Lots of "salt"
