@b5-ufr
Feature: Used from: Mark as Cooked takes from the Lots the User picks (beta.5, ADR 0011)
  Without a pick, Cooked deducts from the Stock Lot that goes off soonest, as before. On the Mark as Cooked sheet and
  the Mark all Cooked sheet (per Course) the User may say which Lots, and how much of each, were really used: the
  picked amounts are deducted first, then any rest of the need in the default order. A pick the Stock cannot honour is
  refused with 422 used_from_invalid and nothing is written. Monday 2026-11-09 12:00 UTC; Dinner is at 19:00 every day,
  Anna eats alone and the roast chicken serves one, so one Batch needs exactly 400 g chicken thighs and 100 g cream.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping Recipes:
      | name          | yield | needs                             |
      | roast chicken | 1     | 400 g chicken thighs, 100 g cream |
    And the shopping Stock gets a Lot of 300 g of "chicken thighs" bought on 2026-11-02 going off on 2026-11-20
    And the shopping Stock gets a Lot of 500 g of "chicken thighs" bought on 2026-11-05 going off on 2026-11-11 in the Storage Place "Garage Fridge"
    And the shopping Stock gets a Lot of 200 g of "cream" bought on 2026-11-06 going off on 2026-11-14
    And the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | roast chicken | 1       |

  Scenario: The Cooked sheet lists each need's Lots, soonest to go off first, with their Storage Place
    When I ask for the Cooked sheet of the Dinner of 2026-11-09
    Then the Cooked sheet needs 400 g of "chicken thighs"
    And the Cooked sheet lists these Lots of "chicken thighs" in this order:
      | quantity | bought     | goes off   | place         |
      | 500      | 2026-11-05 | 2026-11-11 | Garage Fridge |
      | 300      | 2026-11-02 | 2026-11-20 |               |
    And the Cooked sheet lists these Lots of "cream" in this order:
      | quantity | bought     | goes off   | place |
      | 200      | 2026-11-06 | 2026-11-14 |       |

  Scenario: Without a pick the Lot that goes off soonest is used first
    When I mark the Dinner of 2026-11-09 Cooked
    Then the Stock Lot of "chicken thighs" bought on 2026-11-05 holds 100 g
    And the Stock Lot of "chicken thighs" bought on 2026-11-02 holds 300 g
    And the Stock Lot of "cream" bought on 2026-11-06 holds 100 g

  Scenario: Picked Lots are used instead of the default one
    When I mark the Dinner of 2026-11-09 Cooked using:
      | ingredient     | bought     | quantity |
      | chicken thighs | 2026-11-02 | 300      |
      | chicken thighs | 2026-11-05 | 100      |
    Then the Stock Lot of "chicken thighs" bought on 2026-11-02 is used up
    And the Stock Lot of "chicken thighs" bought on 2026-11-05 holds 400 g
    And the Stock Lot of "cream" bought on 2026-11-06 holds 100 g
    And the Dinner of 2026-11-09 is Cooked

  Scenario: A partial pick is topped up from the default order
    When I mark the Dinner of 2026-11-09 Cooked using:
      | ingredient     | bought     | quantity |
      | chicken thighs | 2026-11-02 | 100      |
    Then the Stock Lot of "chicken thighs" bought on 2026-11-02 holds 200 g
    And the Stock Lot of "chicken thighs" bought on 2026-11-05 holds 200 g

  Scenario: A picked amount above the need is taken as picked
    When I mark the Dinner of 2026-11-09 Cooked using:
      | ingredient     | bought     | quantity |
      | chicken thighs | 2026-11-05 | 500      |
    Then the Stock Lot of "chicken thighs" bought on 2026-11-05 is used up
    And the Stock Lot of "chicken thighs" bought on 2026-11-02 holds 300 g

  Scenario: An Ingredient without a pick keeps the default order
    When I mark the Dinner of 2026-11-09 Cooked using:
      | ingredient | bought     | quantity |
      | cream      | 2026-11-06 | 100      |
    Then the Stock Lot of "cream" bought on 2026-11-06 holds 100 g
    And the Stock Lot of "chicken thighs" bought on 2026-11-05 holds 100 g

  Scenario Outline: A pick the Stock cannot honour is refused and nothing is written
    When I try to mark the Dinner of 2026-11-09 Cooked using:
      | ingredient   | bought   | quantity   |
      | <ingredient> | <bought> | <quantity> |
    Then the Cooked answer is 422 with the code "used_from_invalid"
    And the Dinner of 2026-11-09 is still planned
    And the Stock Lot of "chicken thighs" bought on 2026-11-02 holds 300 g
    And the Stock Lot of "chicken thighs" bought on 2026-11-05 holds 500 g
    And the Stock Lot of "cream" bought on 2026-11-06 holds 200 g

    Examples:
      | what                        | ingredient     | bought      | quantity |
      | more than the Lot holds     | chicken thighs | 2026-11-02  | 301      |
      | a Lot of another Ingredient | chicken thighs | 2026-11-06  | 100      |
      | a Lot that does not exist   | chicken thighs | no such Lot | 100      |
      | a zero amount               | chicken thighs | 2026-11-02  | 0        |

  Scenario: A malformed list is a bad request, not a refused pick
    When I mark the Dinner of 2026-11-09 Cooked using a malformed list
    Then the Cooked answer is 400
    And the Dinner of 2026-11-09 is still planned

  Scenario: A refused pick leaves the Dinner free to be cooked the default way
    Given I try to mark the Dinner of 2026-11-09 Cooked using:
      | ingredient     | bought     | quantity |
      | chicken thighs | 2026-11-02 | 999      |
    When I mark the Dinner of 2026-11-09 Cooked
    Then the Dinner of 2026-11-09 is Cooked
    And the Stock Lot of "chicken thighs" bought on 2026-11-05 holds 100 g

  Scenario: Mark all Cooked takes the picks of each Course
    When I mark all Courses of the Dinner of 2026-11-09 Cooked using:
      | ingredient     | bought     | quantity |
      | chicken thighs | 2026-11-02 | 300      |
    Then the Stock Lot of "chicken thighs" bought on 2026-11-02 is used up
    And the Stock Lot of "chicken thighs" bought on 2026-11-05 holds 400 g
    And the Dinner of 2026-11-09 is Cooked

  Scenario: Mark all Cooked without picks deducts the default way
    When I mark all Courses of the Dinner of 2026-11-09 Cooked
    Then the Stock Lot of "chicken thighs" bought on 2026-11-05 holds 100 g
    And the Stock Lot of "chicken thighs" bought on 2026-11-02 holds 300 g

  Scenario: Mark all Cooked refuses a bad pick and cooks nothing
    When I try to mark all Courses of the Dinner of 2026-11-09 Cooked using:
      | ingredient     | bought     | quantity |
      | chicken thighs | 2026-11-02 | 400      |
    Then the Cooked answer is 422 with the code "used_from_invalid"
    And the Dinner of 2026-11-09 is still planned
    And the Stock Lot of "chicken thighs" bought on 2026-11-02 holds 300 g
