@area-shopping-scan
Feature: What a Shopping List Line is for
  Each open Line says which Planned Meals it is for, by date, Meal Slot and Recipe (SSP-14). Monday 2026-11-09.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping Recipes:
      | name             | yield | needs                             |
      | chicken traybake | 2     | 400 g chicken thighs, 200 g rice  |
      | carrot soup      | 2     | 300 g carrots                     |
    And the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 2       |
      | 2026-11-10 | carrot soup      | 1       |
      | 2026-11-11 | chicken traybake | 1       |

  Scenario: The Line sheet says what the Line is for
    When I view the Shopping List
    Then the Shopping List line "rice" is for 2 Planned Meals
    And Planned Meal 1 of "rice" is on 2026-11-09 at "Dinner" for "chicken traybake"
    And Planned Meal 2 of "rice" is on 2026-11-11 at "Dinner" for "chicken traybake"
    And the Shopping List line "carrots" is for 1 Planned Meal
    And Planned Meal 1 of "carrots" is on 2026-11-10 at "Dinner" for "carrot soup"

  Scenario: A range that ends earlier names fewer Planned Meals
    When I view the Shopping List until 2026-11-10
    Then the Shopping List line "rice" is for 1 Planned Meal
