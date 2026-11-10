Feature: Meals waiting in To confirm still count towards the Shopping List
  A Planned Meal whose slot has passed but that nobody confirmed (Cooked) or skipped waits in To confirm. Its Stock
  is used only when it is confirmed, so until then its Ingredients stay on the Shopping List. Monday 2026-11-09
  12:00 UTC; the Dinner slot is at 13:00 and the clock then moves on four hours, so the Dinner of today is three
  hours past its slot and waits in To confirm.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Dinner at 13:00 every day
    And the shopping household plans 3 days ahead
    And the shopping household has the Ingredient "chicken thighs" in g with a Shelf Life of 4 days
    And the shopping Recipes:
      | name             | yield | needs                             |
      | chicken traybake | 2     | 400 g chicken thighs, 200 g rice  |
    And the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 1       |
      | 2026-11-10 | chicken traybake | 1       |
    And the shopping clock moves on 4 hours

  Scenario: A Dinner waiting in To confirm is still needed
    When I view the Shopping List
    Then the Shopping List needs 800 g of "chicken thighs"
    And the Shopping List needs 400 g of "rice"

  Scenario: Skipping the waiting Dinner takes it off the list
    When I mark the shopping dinner of 2026-11-09 as not cooked
    And I view the Shopping List
    Then the Shopping List needs 400 g of "chicken thighs"
    And the Shopping List needs 200 g of "rice"

  Scenario: Stock that covers one Dinner leaves the other to buy
    Given the shopping Stock holds 400 g of "chicken thighs" bought on 2026-11-09
    When I view the Shopping List
    Then the Shopping List needs 400 g of "chicken thighs"
