@br-f
Feature: Shopping List with Stock first for Base recipes (beta.6, docs/dev/design/base-recipes.md section 7)
  A jar of Béchamel in the Pantry covers part of what Lasagne needs; only the Ingredients of the rest go on the list, and the
  Base recipe is never a line itself, unless it is empty. Monday 2026-11-09 12:00 UTC; Dinner is at 19:00 every day and the
  Planning Horizon is 3 days, so every dinner is pinned (Filler, a pinch of salt, unless a scenario pins another Recipe over it) and the planner changes nothing.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping Base recipes:
      | name     | yield | needs                                   |
      | Béchamel | 1 l   | 1000 ml milk, 60 g butter, 60 g flour   |
    And the shopping Recipes calling for Base recipes:
      | name    | yield | needs                          |
      | Lasagne | 4     | 200 g pasta, 500 ml Béchamel   |
    And the shopping Recipes:
      | name   | yield | needs |
      | Filler | 2     | 1 g salt |
    And the shopping dinners are pinned:
      | date       | recipe | batches |
      | 2026-11-09 | Filler | 1       |
      | 2026-11-10 | Filler | 1       |
      | 2026-11-11 | Filler | 1       |

  Scenario: A jar of Béchamel covers part of it, so only the rest's Ingredients are listed
    Given the shopping dinners are pinned:
      | date       | recipe  | batches |
      | 2026-11-10 | Lasagne | 1       |
    And the shopping Stock holds 300 ml of "Béchamel" bought on 2026-11-09
    When I view the Shopping List
    Then the Shopping List needs 200 ml of "milk"
    And the Shopping List needs 12 g of "butter"
    And the Shopping List needs 12 g of "flour"
    And the Shopping List needs 200 g of "pasta"
    And the Shopping List has no line for "Béchamel"

  Scenario: A jar that covers all of it leaves nothing to buy for Béchamel
    Given the shopping dinners are pinned:
      | date       | recipe  | batches |
      | 2026-11-10 | Lasagne | 1       |
    And the shopping Stock holds 600 ml of "Béchamel" bought on 2026-11-09
    When I view the Shopping List
    Then the Shopping List has no line for "milk"
    And the Shopping List has no line for "butter"
    And the Shopping List has no line for "flour"
    And the Shopping List has no line for "Béchamel"
    And the Shopping List needs 200 g of "pasta"

  Scenario: Without a jar the list asks for what Béchamel is made of
    Given the shopping dinners are pinned:
      | date       | recipe  | batches |
      | 2026-11-10 | Lasagne | 1       |
    When I view the Shopping List
    Then the Shopping List needs 500 ml of "milk"
    And the Shopping List needs 30 g of "butter"
    And the Shopping List has no line for "Béchamel"

  Scenario: Two Planned Meals share one jar
    Given the shopping dinners are pinned:
      | date       | recipe  | batches |
      | 2026-11-10 | Lasagne | 1       |
      | 2026-11-11 | Lasagne | 1       |
    And the shopping Stock holds 600 ml of "Béchamel" bought on 2026-11-09
    When I view the Shopping List
    Then the Shopping List needs 400 ml of "milk"
    And the Shopping List needs 24 g of "butter"
    And the Shopping List needs 24 g of "flour"
    And the Shopping List has no line for "Béchamel"

  Scenario: Nested Base recipes resolve the same way
    Given the shopping Base recipes:
      | name | yield | needs                     |
      | Roux | 300 g | 150 g butter, 150 g flour |
    And the shopping Base recipes:
      | name       | yield | needs                     |
      | Rich sauce | 1 l   | 1000 ml milk, 100 g Roux  |
    And the shopping Recipes calling for Base recipes:
      | name         | yield | needs                          |
      | Rich lasagne | 4     | 200 g pasta, 500 ml Rich sauce |
    And the shopping dinners are pinned:
      | date       | recipe       | batches |
      | 2026-11-10 | Rich lasagne | 1       |
    And the shopping Stock holds 300 ml of "Rich sauce" bought on 2026-11-09
    When I view the Shopping List
    Then the Shopping List needs 200 ml of "milk"
    And the Shopping List needs 10 g of "butter"
    And the Shopping List needs 10 g of "flour"
    And the Shopping List has no line for "Rich sauce"
    And the Shopping List has no line for "Roux"

  Scenario: An empty Base recipe is listed as itself
    Given the shopping Base recipes:
      | name  | yield | needs |
      | Pesto | 200 g |       |
    And the shopping Recipes calling for Base recipes:
      | name  | yield | needs                  |
      | Toast | 2     | 100 g bread, 50 g Pesto |
    And the shopping dinners are pinned:
      | date       | recipe | batches |
      | 2026-11-10 | Toast  | 1       |
    When I view the Shopping List
    Then the Shopping List needs 50 g of "Pesto"
    And the Shopping List needs 100 g of "bread"

  Scenario: The past-meal hint shows on the lines that came from a Base recipe
    Given the shopping dinners are pinned:
      | date       | recipe  | batches |
      | 2026-11-09 | Lasagne | 1       |
    And the shopping Stock holds 300 ml of "Béchamel" bought on 2026-11-09
    And the shopping clock moves on 8 hours
    When I view the Shopping List
    Then the Shopping List line "milk" includes the unconfirmed Dinner of 2026-11-09
    And the Shopping List line "butter" includes the unconfirmed Dinner of 2026-11-09
    And the Shopping List line "pasta" includes the unconfirmed Dinner of 2026-11-09

  Scenario: A jar that goes off before the meal is not used
    Given the shopping Base recipe "Béchamel" keeps for 2 days
    And the shopping dinners are pinned:
      | date       | recipe  | batches |
      | 2026-11-10 | Lasagne | 1       |
    And the shopping Stock holds 600 ml of "Béchamel" bought on 2026-11-05
    When I view the Shopping List
    Then the Shopping List needs 500 ml of "milk"
    And the Shopping List needs 30 g of "butter"
    And the Shopping List has no line for "Béchamel"

  Scenario: A jar that is still good on the day of the meal is used
    Given the shopping Base recipe "Béchamel" keeps for 10 days
    And the shopping dinners are pinned:
      | date       | recipe  | batches |
      | 2026-11-10 | Lasagne | 1       |
    And the shopping Stock holds 600 ml of "Béchamel" bought on 2026-11-05
    When I view the Shopping List
    Then the Shopping List has no line for "milk"
    And the Shopping List has no line for "Béchamel"
