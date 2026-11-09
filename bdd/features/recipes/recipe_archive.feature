Feature: Archiving and deleting Recipes
  Archived Recipes are kept for history but hidden from the default list (and,
  later, from planning). A Recipe can only be deleted for good if it was never
  planned.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Ingredient "flour" exists with Base Unit "g"
    And I have created the Recipe "Pancakes" tagged "sweet"
    And I have created the Recipe "Waffles" tagged "sweet"

  Scenario: Archiving hides a Recipe from the default list and unarchiving restores it
    When I archive the Recipe "Pancakes"
    Then the response status is 200
    And the Recipe JSON "archived" is "true"
    When I list the Recipes
    Then the Recipe names are "Waffles"
    When I list the Recipes including archived
    Then the Recipe names are "Pancakes, Waffles"
    When I list only archived Recipes
    Then the Recipe names are "Pancakes"
    When I unarchive the Recipe "Pancakes"
    And I list the Recipes
    Then the Recipe names are "Pancakes, Waffles"

  Scenario: Archiving twice is harmless
    When I archive the Recipe "Pancakes"
    And I archive the Recipe "Pancakes"
    Then the response status is 200
    And the Recipe JSON "archived" is "true"

  Scenario: A Recipe that was never planned can be deleted
    When I delete the Recipe "Pancakes"
    Then the response status is 204
    When I open the Recipe "Pancakes"
    Then the response status is 404

  Scenario: A Recipe that was planned cannot be deleted, only archived
    Given the Recipe "Pancakes" has been planned
    When I delete the Recipe "Pancakes"
    Then the response status is 409
    And the error code is "already_planned"
    When I open the Recipe "Pancakes"
    Then the response status is 200
    When I archive the Recipe "Pancakes"
    Then the response status is 200
