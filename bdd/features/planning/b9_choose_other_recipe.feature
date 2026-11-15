@b9-38 @area-planning
Feature: Choosing a Recipe not marked for the Course (B9-38, PC-10)
  Choose a Recipe for a Course other than the main one lists "Other Recipes": Recipes not marked with that Course. Picking
  one marks it with the Course and sets it there in one write, so the plan PUT takes `markCourse: true`. Without it the
  Recipe is refused as before. The write's Undo puts the plan back; the Recipe stays marked.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Recipe "Roast chicken" for the Course "Main" uses 300 g of "chicken" and has no Steps
    And the C2 Recipe "Green beans" for the Course "Side" uses 100 g of "beans" and has no Steps
    And the C2 plan is empty

  Scenario: I choose a Recipe from Other Recipes and it is marked for the Course
    When I put "Roast chicken" in the Course "Side" on 2026-11-09 and mark it for that Course
    Then the response status is 200
    And the answer JSON at "courseName" is "Side"
    And the answer JSON at "pinned" is "true"
    And the Recipe "Roast chicken" is marked for the Course "Side"
    And the answer has an undo token

  Scenario: Undo puts the plan back and the Recipe stays marked
    When I put "Roast chicken" in the Course "Side" on 2026-11-09 and mark it for that Course
    And I undo the change
    Then the response status is 200
    And the Course "Side" on 2026-11-09 does not hold "Roast chicken"
    And the Recipe "Roast chicken" is marked for the Course "Side"

  Scenario: Without markCourse a Recipe not marked for the Course is still refused
    When I put "Roast chicken" in the Course "Side" on 2026-11-09
    Then the response status is 422
    And the answer JSON at "error.code" is "recipe_not_in_course"
    And the Recipe "Roast chicken" is not marked for the Course "Side"
