@b8-undo
Feature: Undo of a tick takes back the Stock it added (beta.8, undo)
  Undo of a tick by hand, on the Shop screen's untick and on the Scan screen's To get toast alike, puts the Line back
  to get and takes back the Stock Lot the tick added, as Undo of a Scan does (ADR 0019, amending ADR 0013). It takes
  back what is left of that Lot, never more than the tick added, and never another Lot. Undoing twice, or a Line with
  no tick, changes nothing more.

  Monday 2026-11-09 12:00 UTC; dinners are at 19:00 and the Planning Horizon is 3 days, so every dinner is pinned and
  the planner changes nothing. Two Batches of Pasta al pomodoro put a Line of 1400 g of passata on the list.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping Recipes:
      | name              | yield | needs         |
      | Pasta al pomodoro | 2     | 700 g passata |
      | Filler            | 2     | 1 g salt      |
    And the shopping dinners are pinned:
      | date       | recipe            | batches |
      | 2026-11-09 | Pasta al pomodoro | 2       |
      | 2026-11-10 | Filler            | 1       |
      | 2026-11-11 | Filler            | 1       |

  Scenario: Undo of a tick takes back the Stock it added
    Given I tick "passata" on the Shopping List by hand with 1400 g
    And the shopping Stock total of "passata" is 1400 g
    When I untick "passata" on the Shopping List
    Then the shopping Stock total of "passata" is 0 g
    And the shopping Stock has 0 Lots of "passata"

  Scenario: Three ticks and Undos leave no Stock behind
    Given I tick "passata" on the Shopping List by hand with 1400 g
    And I untick "passata" on the Shopping List
    And I tick "passata" on the Shopping List by hand with 1400 g
    And I untick "passata" on the Shopping List
    And I tick "passata" on the Shopping List by hand with 1400 g
    When I untick "passata" on the Shopping List
    Then the shopping Stock total of "passata" is 0 g

  Scenario: Undoing a second time takes nothing more
    Given I tick "passata" on the Shopping List by hand with 700 g
    And I untick "passata" on the Shopping List
    When I untick "passata" on the Shopping List
    Then the shopping Stock total of "passata" is 0 g
    And the Shopping List line "passata" is not ticked

  Scenario: Undo of a tick puts the Line back to get
    Given I tick "passata" on the Shopping List by hand with 1400 g
    When I untick "passata" on the Shopping List
    And I view the Shopping List at "Coop"
    Then the Shopping List line "passata" is not ticked
    And the Shopping List needs 1400 g of "passata"

  Scenario: Undo of an extra's tick takes back the Stock it added
    Given I add the Shopping List extra of 500 g of "flour"
    And I tick the Shopping List extra "flour" with 500 g
    And the shopping Stock total of "flour" is 500 g
    When I untick the Shopping List extra "flour"
    And I view the Shopping List
    Then the shopping Stock total of "flour" is 0 g
    And the Shopping List line "flour" is not ticked
    And the Shopping List extra "flour" still needs 500 g
