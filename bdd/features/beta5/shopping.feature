Feature: Shopping List: Not needed, and past meals still to confirm (beta.5, plan 2.5)
  A User can take a line off the list for the current range because nothing needs buying: it is Not needed, it adds no
  Stock and is not a purchase. Not needed belongs to one range, like a tick. A Planned Meal whose slot has passed and
  that nobody marked Cooked or Not cooked keeps its Ingredients on the list, and the line says so.
  Monday 2026-11-09 12:00 UTC; Dinner is at 19:00 every day and the Planning Horizon is 3 days, so the three dinners
  are pinned and the planner changes nothing.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping Recipes:
      | name          | yield | needs                          |
      | tomato pasta  | 2     | 700 g passata, 320 g pasta     |
    And the shopping dinners are pinned:
      | date       | recipe       | batches |
      | 2026-11-09 | tomato pasta | 1       |
      | 2026-11-10 | tomato pasta | 1       |
      | 2026-11-11 | tomato pasta | 1       |

  Scenario: Not needed takes passata off the list without adding Stock
    When I view the Shopping List
    And I mark "passata" as Not needed on the Shopping List
    Then the Shopping List has no line for "passata"
    And the Shopping List lists "passata" as Not needed with 2100 g
    And the Shopping List needs 960 g of "pasta"
    And the shopping Stock has 0 Lots of "passata"

  Scenario: Needed after all puts the line back
    Given I view the Shopping List
    And I mark "passata" as Not needed on the Shopping List
    When I say "passata" is needed after all on the Shopping List
    Then the Shopping List needs 2100 g of "passata"
    And the Shopping List does not list "passata" as Not needed

  Scenario: A new list range shows a Not needed line again
    Given I mark "passata" as Not needed on the Shopping List for the range ending 2026-11-10
    When I view the Shopping List until 2026-11-11
    Then the Shopping List needs 2100 g of "passata"
    And the Shopping List does not list "passata" as Not needed
    When I view the Shopping List until 2026-11-10
    Then the Shopping List has no line for "passata"
    And the Shopping List lists "passata" as Not needed with 1400 g

  Scenario: The list is complete when every other line is ticked
    Given I view the Shopping List
    And I mark "passata" as Not needed on the Shopping List
    When I tick "pasta" on the Shopping List by hand with 960 g
    And I view the Shopping List
    Then the Shopping List is complete
    And the Shopping List progress is 1 of 1

  Scenario: Not needed lines are not in the progress
    When I view the Shopping List
    And I mark "passata" as Not needed on the Shopping List
    Then the Shopping List progress is 0 of 1
    And the Shopping List is not complete

  Scenario: A Not needed mark is refused for an Ingredient that is not on the list
    Given the shopping household has the Ingredient "rice" in g
    When I view the Shopping List
    And I try to mark "rice" as Not needed on the Shopping List
    Then the Shopping List answers 409 not_on_list

  Scenario: A Planned Meal from Tuesday not marked Cooked keeps its Ingredients on the list
    Given the shopping clock moves on 34 hours
    When I view the Shopping List
    Then the Shopping List needs 2100 g of "passata"
    And the Shopping List line "passata" includes the unconfirmed Dinner of 2026-11-09
    And the Shopping List line "passata" includes the unconfirmed Dinner of 2026-11-10
    And the Shopping List line "passata" does not include the unconfirmed Dinner of 2026-11-11

  Scenario: Marking the Tuesday Dinner not cooked takes it off the line and the hint
    Given the shopping clock moves on 34 hours
    When I mark the shopping dinner of 2026-11-10 as not cooked
    And I view the Shopping List
    Then the Shopping List needs 1400 g of "passata"
    And the Shopping List line "passata" does not include the unconfirmed Dinner of 2026-11-10

  Scenario: A line with a past Planned Meal can still be Not needed
    Given the shopping clock moves on 34 hours
    And I view the Shopping List
    When I mark "passata" as Not needed on the Shopping List
    Then the Shopping List lists "passata" as Not needed with 2100 g
    And the Shopping List line "passata" includes the unconfirmed Dinner of 2026-11-10

  Scenario: A scan of a Not needed Ingredient adds the Lot off the list and the line stays Not needed
    Given the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    And I view the Shopping List
    And I mark "passata" as Not needed on the Shopping List
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" was applied
    And scan "scan-0001" is not on the list
    And scan "scan-0001" did not tick the line
    And the shopping Stock total of "passata" is 700 g
    When I view the Shopping List
    Then the Shopping List lists "passata" as Not needed with 1400 g
    And the Shopping List has no line for "passata"

