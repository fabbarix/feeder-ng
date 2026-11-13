@br-f
Feature: Planning with Base recipes (beta.6, docs/dev/design/base-recipes.md section 5)
  A Base recipe is never planned. A Recipe that calls for one is planned from the Ingredients inside it, at any depth: an
  Exclusion of milk inside Béchamel, or of Béchamel itself, rules Lasagne out, and Review Exclusions names it. A Base
  recipe's Advance Step counts for the lead time of the cell. Monday 2026-11-09 12:00 UTC; Dinner at 19:00 serves Main.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" attended by Anna and Sam
    And the C2 plan is empty

  Scenario: A Base recipe is never planned, and no Course can be given one
    Given the C2 Base recipes:
      | name     | yield | needs          | advance |
      | Béchamel | 1 l   | 1000 ml milk   |         |
    When the planner replans everything
    And I view the C2 plan for 2026-11-09
    Then the C2 Course "Main" has the reason "no_course_recipes"
    When I put "Béchamel" in the Course "Main" on 2026-11-09
    Then the response status is 422

  Scenario: An Exclusion of milk inside Béchamel rules Lasagne out
    Given the C2 Base recipes:
      | name     | yield | needs                                   | advance |
      | Béchamel | 1 l   | 1000 ml milk, 60 g butter, 60 g flour   |         |
    And the C2 Recipes calling for Base recipes:
      | name    | course | yield | needs                      |
      | Lasagne | Main   | 4     | 200 g pasta, 500 ml Béchamel |
    And the C2 Member "Sam" excludes the C2 Ingredient "milk"
    When the planner replans everything
    And I view the C2 plan for 2026-11-09
    Then the C2 Course "Main" holds no Recipe
    When I list the Review Exclusions cells
    Then the response status is 200
    And the Review Exclusions list has 1 cells
    And the Review Exclusions cell 1 is the Course "Main" on 2026-11-09
    And the Review Exclusions cell 1 record 1 is the Exclusion of "milk" by "Sam" ruling out 1 Recipes: "Lasagne"

  Scenario: An Exclusion deep inside nested Base recipes rules Lasagne out
    Given the C2 Base recipes:
      | name     | yield | needs                       | advance |
      | Roux     | 300 g | 150 g butter, 150 g flour   |         |
      | Béchamel | 1 l   | 1000 ml milk, 100 g Roux    |         |
    And the C2 Recipes calling for Base recipes:
      | name    | course | yield | needs                        |
      | Lasagne | Main   | 4     | 200 g pasta, 500 ml Béchamel |
    And the C2 Member "Sam" excludes the C2 Ingredient "butter"
    When the planner replans everything
    And I list the Review Exclusions cells
    Then the Review Exclusions list has 1 cells
    And the Review Exclusions cell 1 record 1 is the Exclusion of "butter" by "Sam" ruling out 1 Recipes: "Lasagne"

  Scenario: An Exclusion of Béchamel itself rules Lasagne out, and Review Exclusions names it
    Given the C2 Base recipes:
      | name     | yield | needs                                   | advance |
      | Béchamel | 1 l   | 1000 ml milk, 60 g butter, 60 g flour   |         |
    And the C2 Recipes calling for Base recipes:
      | name    | course | yield | needs                        |
      | Lasagne | Main   | 4     | 200 g pasta, 500 ml Béchamel |
    And the C2 Member "Sam" excludes the Base recipe "Béchamel"
    When the planner replans everything
    And I list the Review Exclusions cells
    Then the Review Exclusions list has 1 cells
    And the Review Exclusions cell 1 is the Course "Main" on 2026-11-09
    And the Review Exclusions cell 1 record 1 is the Exclusion of "Béchamel" by "Sam" ruling out 1 Recipes: "Lasagne"

  Scenario: Nobody excludes anything, so Lasagne is planned
    Given the C2 Base recipes:
      | name     | yield | needs                                   | advance |
      | Béchamel | 1 l   | 1000 ml milk, 60 g butter, 60 g flour   |         |
    And the C2 Recipes calling for Base recipes:
      | name    | course | yield | needs                        |
      | Lasagne | Main   | 4     | 200 g pasta, 500 ml Béchamel |
    When the planner replans everything
    And I view the C2 plan for 2026-11-09
    Then the C2 Course "Main" holds "Lasagne"

  Scenario: A Base recipe's Advance Step blocks a cell that is too late
    Given the C2 Base recipes:
      | name     | yield | needs          | advance |
      | Béchamel | 1 l   | 1000 ml milk   | 600     |
    And the C2 Recipes calling for Base recipes:
      | name    | course | yield | needs                        |
      | Lasagne | Main   | 4     | 200 g pasta, 500 ml Béchamel |
    When the planner replans everything
    And I view the C2 plan for 2026-11-09
    Then the C2 Course "Main" holds no Recipe

  Scenario: A shorter Advance Step of the Base recipe still fits the same cell
    Given the C2 Base recipes:
      | name     | yield | needs          | advance |
      | Béchamel | 1 l   | 1000 ml milk   | 60      |
    And the C2 Recipes calling for Base recipes:
      | name    | course | yield | needs                        |
      | Lasagne | Main   | 4     | 200 g pasta, 500 ml Béchamel |
    When the planner replans everything
    And I view the C2 plan for 2026-11-09
    Then the C2 Course "Main" holds "Lasagne"
