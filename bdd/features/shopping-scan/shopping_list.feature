Feature: Shopping List
  The Shopping List holds the Ingredients and quantities still needed for uncooked Planned Meals from now up to
  a chosen date, less Stock, plus manual extras. Monday 2026-11-09 12:00 UTC; dinners are at 19:00 and the
  Planning Horizon is 3 days, so every dinner is pinned here and the planner changes nothing.
  The plan fixtures use the Planning API (T11); these scenarios stay red until T11 is synced into this branch.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has a Shop "Aldi"
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping household has the Ingredient "chicken thighs" in g with a Shelf Life of 4 days
    And the shopping Recipes:
      | name             | yield | needs                                    |
      | chicken traybake | 2     | 400 g chicken thighs, 200 g rice         |
      | carrot soup      | 2     | 300 g carrots, 20 g parsley (optional)   |
    And the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 2       |
      | 2026-11-10 | carrot soup      | 1       |
      | 2026-11-11 | chicken traybake | 1       |

  Scenario: The need is Batches times the quantity, summed over the meals, without optional lines
    When I view the Shopping List
    Then the Shopping List needs 1200 g of "chicken thighs"
    And the Shopping List needs 600 g of "rice"
    And the Shopping List needs 300 g of "carrots"
    And the Shopping List has no line for "parsley"
    And the Shopping List range ends on 2026-11-11

  Scenario: Stock is subtracted
    Given the shopping Stock holds 500 g of "chicken thighs" bought on 2026-11-09
    When I view the Shopping List
    Then the Shopping List needs 700 g of "chicken thighs"

  Scenario: Stock that has gone off by the day of a meal does not count for that meal
    Given the shopping Stock holds 1000 g of "chicken thighs" bought on 2026-11-06
    When I view the Shopping List
    Then the Shopping List needs 400 g of "chicken thighs"

  Scenario: The range ends on the chosen date
    When I view the Shopping List until 2026-11-09
    Then the Shopping List needs 800 g of "chicken thighs"
    And the Shopping List has no line for "carrots"
    And the Shopping List range ends on 2026-11-09

  Scenario: A chosen date beyond the Planning Horizon is capped
    When I view the Shopping List until 2026-12-31
    Then the Shopping List range ends on 2026-11-11

  Scenario: Packs come from the Product last bought and are rounded up
    Given the shopping catalogue has the Product "Chicken thighs 500 g" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    And the household last bought "Chicken thighs 500 g" at "Coop"
    When I view the Shopping List at "Coop"
    Then the Shopping List suggests 3 × "Chicken thighs 500 g" for "chicken thighs"
    And the Shopping List shows no pack for "rice"

  Scenario: The estimated cost uses the latest Price at the selected Shop, else any Shop
    Given the shopping catalogue has the Product "Chicken thighs 500 g" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    And the household last bought "Chicken thighs 500 g" at "Coop"
    And "Chicken thighs 500 g" costs 450 cents at "Aldi"
    When I view the Shopping List at "Coop"
    Then the line "chicken thighs" costs 1350 cents
    And the line "rice" has no price
    And the Shopping List estimates 1350 cents
    Given "Chicken thighs 500 g" costs 500 cents at "Coop"
    When I view the Shopping List at "Coop"
    Then the line "chicken thighs" costs 1500 cents

  Scenario: Manual extras are not tied to the plan and stay until deleted
    When I add the Shopping List extra "toilet paper"
    And I add the Shopping List extra of 2000 ml of "milk"
    And I view the Shopping List
    Then the Shopping List shows the extra "toilet paper"
    And the Shopping List extra "milk" still needs 2000 ml
    And the Shopping List progress is 0 of 5

  Scenario: Tick by hand asks how much and adds a Stock Lot
    When I tick "rice" on the Shopping List by hand with 600 g
    And I view the Shopping List
    Then the Shopping List line "rice" is ticked
    And the shopping Stock total of "rice" is 600 g
    And the Shopping List progress is 1 of 3

  Scenario: Ticked state belongs to the range
    When I tick "rice" on the Shopping List by hand with 0 g
    And I view the Shopping List until 2026-11-10
    Then the Shopping List line "rice" is not ticked
    When I view the Shopping List
    Then the Shopping List line "rice" is ticked

  Scenario: Unticking a line
    Given I tick "rice" on the Shopping List by hand with 0 g
    When I untick "rice" on the Shopping List
    And I view the Shopping List
    Then the Shopping List line "rice" is not ticked

  Scenario: Once every line is ticked the list is complete
    When I tick "chicken thighs" on the Shopping List by hand with 1200 g
    And I tick "rice" on the Shopping List by hand with 600 g
    And I tick "carrots" on the Shopping List by hand with 300 g
    And I view the Shopping List
    Then the Shopping List progress is 3 of 3
    And the Shopping List is complete
    And the Shopping List summary is 3 items, 0 cents spent and 3 Stock Lots added
