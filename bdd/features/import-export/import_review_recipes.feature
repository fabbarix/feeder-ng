@area-import-export
Feature: Import Review lists the Recipes it imports
  The review is read-only: it shows each Recipe of the file with its Yield, Ingredients and Steps before anything is saved.
  Corrections are made with Edit on the imported Recipe afterwards (decision RX 3). The result names the Recipes it made.
  (B9-28, RX-01. The screen itself, its rows, the jump to the first question and the focus moves are covered by vitest and the
  page-layout scenario import-review: this suite has no browser.)

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: Import Review lists each Recipe of the file with its Yield, Ingredients and Steps
    When I review the example Recipe File
    Then the response status is 201
    And the review lists the Recipe "Chicken tikka traybake" with a Yield of 4, 8 Ingredient lines and 6 Steps
    And the first line of the review of "Chicken tikka traybake" is 800 g of "chicken thighs" with the note "boneless, skinless"
    And the review lists the Recipe "Lasagne (ready meal)" as a Ready Meal with a Yield of 2, 1 Ingredient line and 1 Step
    And the review lists the Recipes in the order of the file: "Chicken tikka traybake, Lasagne (ready meal)"

  Scenario: A Recipe that already exists shows Replace, Keep both and Skip on its own row
    Given the household already has the Recipe "Chicken tikka traybake"
    When I review the example Recipe File
    Then the review has a conflict for the Recipe "Chicken tikka traybake"
    And the conflict for "Chicken tikka traybake" names the existing Recipe
    And the review lists the Recipe "Chicken tikka traybake" with a Yield of 4, 8 Ingredient lines and 6 Steps
    When I answer the review with:
      """
      {"decisions": {"recipes": [{"index": 0, "action": "skip"}]}}
      """
    Then the review lists the Recipe "Chicken tikka traybake" with a Yield of 4, 8 Ingredient lines and 6 Steps
    And the review lists the Recipe "Lasagne (ready meal)" as a Ready Meal with a Yield of 2, 1 Ingredient line and 1 Step

  Scenario: The import result links to each imported Recipe and its editor
    When I review the example Recipe File
    And I confirm the review with no answers
    Then the response status is 200
    And the import result lists the Recipe "Chicken tikka traybake" as "created"
    And the import result lists the Recipe "Lasagne (ready meal)" as "created"
    And every Recipe of the import result can be opened by its id
    And the import result says 9 Ingredients were created
