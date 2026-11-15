@area-shopping-scan
Feature: A tick by hand adds Stock, covers an amount and can be ticked twice (beta.9, SSP-01, SSP-02, RES-03)
  A tick by hand puts the last-bought pack, or the Line's need when no pack is known, into Stock in one tap, with Undo and
  Change. A tick covers an amount: need that grows after a tick reappears in To get as "More since your tick". A Line
  that two shoppers tick keeps both Stock Lots, and each Stock Lot is taken back on its own. Monday 2026-11-09 12:00 UTC;
  one dinner today, so the need is 400 g and a second Batch grows it to 800 g. The one-tap amount is worked out on the phone from the Line (count × pack size, else the quantity); the scenarios send
  the amount the Shopping List suggests, as the phone does. The toast, the sheet and the row text are covered by the web
  tests of the Shop screen.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And "partner@example.test" is on the allowlist
    And the shopping household has a Shop "Coop"
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 1 days ahead
    And the shopping household has the Ingredient "chicken thighs" in g
    And the shopping Recipes:
      | name             | yield | needs                  |
      | chicken traybake | 2     | 400 g chicken thighs   |
    And the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 1       |

  Scenario: One tap ticks a Line with the last-bought pack
    Given the shopping catalogue has the Product "Chicken thighs 500 g" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    And the household last bought "Chicken thighs 500 g" at "Coop"
    When I tick "chicken thighs" with the pack the Shopping List suggests
    Then the shopping Stock total of "chicken thighs" is 500 g
    And the line "chicken thighs" says it added 500 g to Stock
    And the line "chicken thighs" was ticked by hand

  Scenario: With no pack known one tap ticks the Line's need
    When I tick "chicken thighs" with the pack the Shopping List suggests
    Then the shopping Stock total of "chicken thighs" is 400 g
    And the line "chicken thighs" says it added 400 g to Stock

  Scenario: Undo of a one-tap tick takes its Stock back
    Given I tick "chicken thighs" with the pack the Shopping List suggests
    When I untick "chicken thighs" on the Shopping List
    Then the shopping Stock total of "chicken thighs" is 0 g
    And the line "chicken thighs" is open

  Scenario: Change sets the amount the tick added
    Given I tick "chicken thighs" with 500 g as tick "t1"
    When I change my tick of "chicken thighs" to 650 g
    Then the shopping Stock total of "chicken thighs" is 650 g
    And the shopping Stock has 1 Lots of "chicken thighs"
    And the line "chicken thighs" says it added 650 g to Stock

  Scenario: Tick without adding from Change keeps the tick and removes the Stock
    Given I tick "chicken thighs" with 500 g as tick "t1"
    When I take back what I added to "chicken thighs"
    Then the shopping Stock total of "chicken thighs" is 0 g
    And the line "chicken thighs" was ticked by hand
    And the line "chicken thighs" says it added nothing to Stock

  Scenario: A ticked row says whether Stock was added
    Given I tick "chicken thighs" without adding Stock as tick "t1"
    Then the line "chicken thighs" was ticked by hand
    And the line "chicken thighs" says it added nothing to Stock

  Scenario: A ticked row says when a Scan ticked it
    Given the shopping catalogue has the Product "Chicken thighs 500 g" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    When I scan the barcode "4000000000013" at "Coop" as scan "s1"
    Then the line "chicken thighs" was ticked by scan
    And the line "chicken thighs" says it added 500 g to Stock

  Scenario: Need that grows after a tick reappears as More since your tick
    Given I tick "chicken thighs" with 400 g as tick "t1"
    When the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 2       |
    Then the line "chicken thighs" is ticked and shows 400 g more since the tick
    When I view the Shopping List
    Then the Shopping List progress is 1 of 2
    And the Shopping List is not complete

  Scenario: Ticking the extra row ticks only the difference
    Given I tick "chicken thighs" with 400 g as tick "t1"
    And the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 2       |
    When I tick "chicken thighs" with the pack the Shopping List suggests
    Then the shopping Stock total of "chicken thighs" is 800 g
    And the line "chicken thighs" has 2 additions
    And the line "chicken thighs" shows nothing more since the tick
    When I view the Shopping List
    Then the Shopping List is complete

  Scenario: Tick without adding on the More row says the difference is covered
    Given I tick "chicken thighs" with 400 g as tick "t1"
    And the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 2       |
    When I tick "chicken thighs" without adding Stock as tick "t2"
    Then the shopping Stock total of "chicken thighs" is 400 g
    And the line "chicken thighs" has 2 additions
    And the line "chicken thighs" shows nothing more since the tick
    When I view the Shopping List
    Then the Shopping List is complete

  Scenario: Shopping List complete waits for a reopened Line
    Given I tick "chicken thighs" with 400 g as tick "t1"
    When I view the Shopping List
    Then the Shopping List is complete
    When the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 2       |
    And I view the Shopping List
    Then the Shopping List is not complete

  Scenario: A Line two shoppers tick keeps both Stock Lots
    Given I tick "chicken thighs" with 400 g as tick "t1"
    When I am signed in as "partner@example.test"
    And I tick "chicken thighs" with 300 g as tick "t2"
    Then the shopping Stock has 2 Lots of "chicken thighs"
    And the shopping Stock total of "chicken thighs" is 700 g
    And the line "chicken thighs" has 2 additions
    And the line "chicken thighs" has an addition of 400 g by "User" that is not mine
    And the line "chicken thighs" has an addition of 300 g by "partner" that is mine

  Scenario: Take mine back removes only my Stock Lot
    Given I tick "chicken thighs" with 400 g as tick "t1"
    And I am signed in as "partner@example.test"
    And I tick "chicken thighs" with 300 g as tick "t2"
    When I take back what I added to "chicken thighs"
    Then the shopping Stock total of "chicken thighs" is 400 g
    And the line "chicken thighs" was ticked by hand
    And the line "chicken thighs" has 2 additions

  Scenario: Untick takes back every hand addition
    Given I tick "chicken thighs" with 400 g as tick "t1"
    And I am signed in as "partner@example.test"
    And I tick "chicken thighs" with 300 g as tick "t2"
    When I untick "chicken thighs" on the Shopping List
    Then the shopping Stock total of "chicken thighs" is 0 g
    And the line "chicken thighs" is open
