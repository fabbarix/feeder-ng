Feature: Exporting Recipes as a Recipe File
  Pick Recipes (or all of them) and download a .feeder.json file with images embedded and
  a definition for every Ingredient used.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: Exporting from an empty household is refused
    When I export all Recipes
    Then the response status is 422
    And the error code is "nothing_to_export"

  Scenario: Export all
    Given the household has the Recipe File Recipe "Pancakes" with a photo, using the Ingredient "flour" in g
    And the household has the Recipe File Recipe "Porridge", using the Ingredient "oats" in g
    When I export all Recipes
    Then the response status is 200
    And the download is named "feeder-recipes-2026-11-09.feeder.json"
    And the downloaded Recipe File is valid and holds the Recipes "Pancakes, Porridge"
    And the downloaded Recipe File defines the Ingredients "flour, oats"
    And the Recipe "Pancakes" in the downloaded Recipe File has its photo embedded

  Scenario: Export a pick, with only the Ingredients that pick uses
    Given the household has the Recipe File Recipe "Pancakes" with a photo, using the Ingredient "flour" in g
    And the household has the Recipe File Recipe "Porridge", using the Ingredient "oats" in g
    When I export the Recipe "Porridge"
    Then the downloaded Recipe File is valid and holds the Recipes "Porridge"
    And the downloaded Recipe File defines the Ingredients "oats"

  Scenario: An unknown Recipe is not found
    When I export the Recipe with id 999
    Then the response status is 404

  Scenario: Exporting needs a pick
    When I GET "/api/recipe-file/export"
    Then the response status is 400
    And the error code is "bad_request"

  Scenario: Exported Recipes can be imported again as copies
    Given the household has the Recipe File Recipe "Pancakes" with a photo, using the Ingredient "flour" in g
    When I export all Recipes
    And I review the downloaded Recipe File
    Then the review lists the Ingredient "flour" as "exact"
    And the review has a conflict for the Recipe "Pancakes"
    When I answer the review with:
      """
      {"decisions": {"recipes": [{"index": 0, "action": "keep_both"}]}}
      """
    And I confirm the review with the same answers
    Then the response status is 200
    And the household has the Recipes "Pancakes, Pancakes (2)"
