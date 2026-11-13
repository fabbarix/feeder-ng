@br-g
Feature: Cooked with Base recipes takes the jar first (beta.6, docs/dev/design/base-recipes.md section 8)
  Marking a Recipe Cooked uses the Stock of its Base recipe first, and only the part that Stock does not cover is made from
  the Base recipe's own Ingredients. Used from lists the jar like any other Ingredient. Monday 2026-11-09 12:00 UTC; Dinner
  is at 19:00 every day. One Batch of Lasagne calls for 200 g pasta and 500 ml Béchamel; a litre of Béchamel is 1000 ml milk,
  60 g butter and 60 g flour, so 500 ml of it is 500 ml milk, 30 g butter and 30 g flour. Stock Lots are written in the
  quantity of their Ingredient's Base Unit.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping Base recipes:
      | name     | yield | needs                                 |
      | Béchamel | 1 l   | 1000 ml milk, 60 g butter, 60 g flour |
    And the shopping Recipes calling for Base recipes:
      | name    | yield | needs                        |
      | Lasagne | 4     | 200 g pasta, 500 ml Béchamel |
    And the shopping Stock gets a Lot of 500 g of "pasta" bought on 2026-11-02 going off on 2026-11-20
    And the shopping Stock gets a Lot of 1000 g of "milk" bought on 2026-11-02 going off on 2026-11-20
    And the shopping Stock gets a Lot of 100 g of "butter" bought on 2026-11-02 going off on 2026-11-20
    And the shopping Stock gets a Lot of 100 g of "flour" bought on 2026-11-02 going off on 2026-11-20
    And the shopping dinners are pinned:
      | date       | recipe  | batches |
      | 2026-11-09 | Lasagne | 1       |

  Scenario: Cooked takes the jar first and the rest from milk, butter and flour
    Given the shopping Stock gets a Lot of 300 g of "Béchamel" bought on 2026-11-05 going off on 2026-11-20
    When I mark the Dinner of 2026-11-09 Cooked
    Then the Dinner of 2026-11-09 is Cooked
    And the Stock Lot of "Béchamel" bought on 2026-11-05 is used up
    And the Stock Lot of "milk" bought on 2026-11-02 holds 800 g
    And the Stock Lot of "butter" bought on 2026-11-02 holds 88 g
    And the Stock Lot of "flour" bought on 2026-11-02 holds 88 g
    And the Stock Lot of "pasta" bought on 2026-11-02 holds 300 g

  Scenario: A jar that covers all of it leaves milk, butter and flour alone
    Given the shopping Stock gets a Lot of 600 g of "Béchamel" bought on 2026-11-05 going off on 2026-11-20
    When I mark the Dinner of 2026-11-09 Cooked
    Then the Stock Lot of "Béchamel" bought on 2026-11-05 holds 100 g
    And the Stock Lot of "milk" bought on 2026-11-02 holds 1000 g
    And the Stock Lot of "butter" bought on 2026-11-02 holds 100 g
    And the Stock Lot of "flour" bought on 2026-11-02 holds 100 g
    And the Stock Lot of "pasta" bought on 2026-11-02 holds 300 g

  Scenario: Without a jar Cooked takes the Ingredients of the whole Béchamel
    When I mark the Dinner of 2026-11-09 Cooked
    Then the Stock Lot of "milk" bought on 2026-11-02 holds 500 g
    And the Stock Lot of "butter" bought on 2026-11-02 holds 70 g
    And the Stock Lot of "flour" bought on 2026-11-02 holds 70 g
    And the Stock Lot of "pasta" bought on 2026-11-02 holds 300 g

  Scenario: The Cooked sheet lists the jar, and only the rest as Ingredients
    Given the shopping Stock gets a Lot of 300 g of "Béchamel" bought on 2026-11-05 going off on 2026-11-20
    When I ask for the Cooked sheet of the Dinner of 2026-11-09
    Then the Cooked sheet needs 300 ml of "Béchamel"
    And the Cooked sheet needs 200 ml of "milk"
    And the Cooked sheet needs 12 g of "butter"
    And the Cooked sheet needs 200 g of "pasta"
    And the Cooked sheet lists these Lots of "Béchamel" in this order:
      | quantity | bought     | goes off   | place |
      | 300      | 2026-11-05 | 2026-11-20 |       |

  Scenario: Used from picks the jar, and the rest is made from the Ingredients
    Given the shopping Stock gets a Lot of 400 g of "Béchamel" bought on 2026-11-05 going off on 2026-11-20
    And the shopping Stock gets a Lot of 200 g of "Béchamel" bought on 2026-11-06 going off on 2026-11-21
    When I mark the Dinner of 2026-11-09 Cooked using:
      | ingredient | bought     | quantity |
      | Béchamel   | 2026-11-06 | 200      |
    Then the Stock Lot of "Béchamel" bought on 2026-11-06 is used up
    And the Stock Lot of "Béchamel" bought on 2026-11-05 holds 400 g
    And the Stock Lot of "milk" bought on 2026-11-02 holds 700 g
    And the Stock Lot of "butter" bought on 2026-11-02 holds 82 g
    And the Stock Lot of "flour" bought on 2026-11-02 holds 82 g
