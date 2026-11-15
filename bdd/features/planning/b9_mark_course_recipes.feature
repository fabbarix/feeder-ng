Feature: Marking Recipes with a Course from the Plan (B9-32, PC-07)
  When the planner could not fill a Course because no Recipe is marked with it, "Mark Recipes as Dessert" marks
  Recipes right on the Plan. One call adds the Course to each Recipe, replans once and says what changed, so the
  Plan can show it and offer Undo.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Recipe "Roast chicken" for the Course "Main" uses 300 g of "chicken" and has no Steps
    And the C2 Recipe "Peas" for the Course "Main" uses 100 g of "peas" and has no Steps
    And the C2 plan is empty

  Scenario: I mark Recipes as Side without leaving the Plan
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan could not fill the Course "Side" on 2026-11-09 because "no_course_recipes"
    When I mark the Recipe "Peas" as the Course "Side" from the Plan
    Then the response status is 200
    And the answer says 1 Recipe was marked
    And the Recipe "Peas" is marked for the Course "Side"
    And the answer has an undo token

  Scenario: Marking a Recipe that already has the Course changes nothing
    When I mark the Recipe "Peas" as the Course "Main" from the Plan
    Then the response status is 200
    And the answer says 0 Recipes were marked
    And the answer has no undo token

  Scenario: One unknown Recipe refuses the whole call
    When I mark the Recipe "Peas" and a Recipe that does not exist as the Course "Side" from the Plan
    Then the response status is 422
    And the Recipe "Peas" is not marked for the Course "Side"

  Scenario: Undo unmarks only the Recipes the call marked
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    When I mark the Recipe "Peas" and the Recipe "Roast chicken" as the Course "Main" from the Plan
    Then the answer says 0 Recipes were marked
    When I mark the Recipe "Peas" as the Course "Side" from the Plan
    And I undo marking those Recipes as the Course "Side"
    Then the response status is 200
    And the answer says 1 Recipe is no longer marked
    And the Recipe "Peas" is not marked for the Course "Side"
    And the Recipe "Peas" is marked for the Course "Main"
