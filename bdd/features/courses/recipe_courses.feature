@crs-c1
Feature: Courses and Whole meal on a Recipe
  A Recipe is marked with one or more Courses and may be a Whole meal (spec 3.1, 4).

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: A Recipe without Courses is marked Main and is not a Whole meal
    When I create the Recipe "Roast" without Courses
    Then the response status is 201
    And the Recipe answer shows the Courses "Main"
    And the Recipe answer is not a Whole meal

  Scenario: A Recipe shows its Courses in household order
    When I create the Recipe "Gratin" for the Courses "Dessert", "Side" and "Main" as a Whole meal
    Then the response status is 201
    And the Recipe answer shows the Courses "Main", "Side" and "Dessert"
    And the Recipe answer is a Whole meal

  Scenario: A Recipe needs a Course when it lists any
    When I create the Recipe "Roast" with an empty list of Courses
    Then the response status is 422
    And the error code is "validation_failed"
    And the error names the field "courses" and the reason "courses_empty"

  Scenario: A Ready Meal served as Main is a Whole meal unless said otherwise
    When I create the Ready Meal "Lasagne pack"
    Then the Recipe answer is a Whole meal
    When I create the Ready Meal "Cake pack" for the Courses "Dessert"
    Then the Recipe answer is not a Whole meal

  Scenario: Saving a Recipe without Courses keeps them
    Given I create the Recipe "Gratin" for the Courses "Main" and "Side" as a Whole meal
    When I save the Recipe "Gratin" without touching its Courses
    Then the response status is 200
    And the Recipe answer shows the Courses "Main" and "Side"
    And the Recipe answer is a Whole meal

  Scenario: Filtering Recipes by Course
    Given I create the Recipe "Roast" without Courses
    And I create the Recipe "Gratin" for the Courses "Main" and "Side"
    And I create the Recipe "Greens" for the Courses "Side"
    When I list the Recipes marked with the Course "Side"
    Then the listed Recipes are "Gratin" and "Greens"
    When I list the Recipes not marked with the Course "Side"
    Then the listed Recipes are "Roast"

  Scenario: A filter must be a Course id
    When I list the Recipes with the filter "course=abc"
    Then the response status is 422
    And the error names the field "course" and the reason "course_invalid"

  Scenario: A Recipe that loses a Course loses its Slot Rule and unpinned Planned Meals there
    Given I am signed in as the Admin
    And the Household has the Meal Slot "Dinner" on Thursday at 19:00 attended by nobody
    And I create the Recipe "Greens" for the Courses "Main" and "Side"
    And the Admin saves the Meal Slot "Dinner" on Thursday with the Courses "Main", "Side"
    And the planner has finished
    And the Meal Slot "Dinner" on Thursday has an unpinned Planned Meal of "Greens" in "Side" on 2026-11-12
    And the Meal Slot "Dinner" on Thursday has a Slot Rule for "Greens" in "Side"
    When I save the Recipe "Greens" for the Courses "Main"
    Then the response status is 200
    And the Meal Slot "Dinner" on Thursday has 0 unresolved Planned Meals in "Side" from today on
    And the Meal Slot "Dinner" on Thursday has 0 Slot Rules in "Side"
