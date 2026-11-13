@br-g
Feature: Mark all Cooked shares one jar across the Courses (beta.6, docs/dev/design/base-recipes.md section 8)
  A Main and a Side that both call for Béchamel are cooked from the same jar: the Main (first in the slot's order) takes what
  it needs, the Side takes what is left and makes the rest. The C2 household: Monday 2026-11-09 12:00 UTC, a Dinner at 19:00
  serving Main and Side. A litre of Béchamel is 1000 ml milk, 60 g butter and 60 g flour. Lasagne (Main) and Spinach bake
  (Side) each call for 500 ml of it, one Batch each.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Base recipes:
      | name     | yield | needs                                 |
      | Béchamel | 1 l   | 1000 ml milk, 60 g butter, 60 g flour |
    And the C2 Recipes calling for Base recipes:
      | name         | course | yield | needs                          |
      | Lasagne      | Main   | 4     | 200 g pasta, 500 ml Béchamel   |
      | Spinach bake | Side   | 2     | 100 g spinach, 500 ml Béchamel |
    And the BR-G Stock holds 1000 g of "milk"
    And the BR-G Stock holds 100 g of "butter"
    And the BR-G Stock holds 100 g of "flour"
    And the shopping Stock holds 600 ml of "Béchamel" bought on 2026-11-09
    And the C2 plan is empty
    And the C2 plan has "Lasagne" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan has "Spinach bake" in the Course "Side" on 2026-11-09 as planned

  Scenario: Mark all Cooked uses the 600 ml jar once: 500 ml for the Main, 100 ml and a made 400 ml for the Side
    When I mark all Courses on 2026-11-09 as Cooked
    Then the response status is 200
    And the BR-G Stock of "Béchamel" is 0 ml
    And the BR-G Stock of "milk" is 600 g
    And the BR-G Stock of "butter" is 76 g
    And the BR-G Stock of "flour" is 76 g

  Scenario: Marking the Courses one at a time comes to the same
    When I mark as Cooked the Course "Main" on 2026-11-09
    Then the BR-G Stock of "Béchamel" is 100 ml
    And the BR-G Stock of "milk" is 1000 g
    When I mark as Cooked the Course "Side" on 2026-11-09
    Then the BR-G Stock of "Béchamel" is 0 ml
    And the BR-G Stock of "milk" is 600 g
    And the BR-G Stock of "butter" is 76 g
