@keeping @area-ingredients
Feature: Keeping an Ingredient, in one save
  The Ingredient page keeps Shelf Life and Frozen Shelf Life behind one "Save changes" and Rename in a sheet (SET-05). The page sends
  all the values in one PATCH, so the API takes them together and answers once. (The browser half of these scenarios is vitest:
  web/src/features/ingredients/screens/IngredientScreen.page.test.tsx.)

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Household has the Ingredient "flour" with Base Unit g

  Scenario: Change Shelf Life and Frozen Shelf Life and save both at once
    When I PATCH the Ingredient "flour" with JSON:
      """
      {"shelfLifeDays": 10, "frozenShelfLifeDays": 90}
      """
    Then the response status is 200
    And the response JSON field "shelfLifeDays" is "10"
    And the response JSON field "frozenShelfLifeDays" is "90"

  Scenario: Both Shelf Lives are cleared together
    Given I PATCH the Ingredient "flour" with JSON:
      """
      {"shelfLifeDays": 10, "frozenShelfLifeDays": 90}
      """
    When I PATCH the Ingredient "flour" with JSON:
      """
      {"shelfLifeDays": null, "frozenShelfLifeDays": null}
      """
    Then the response status is 200
    And the Ingredient response has no Shelf Life

  Scenario: One bad value saves nothing
    Given I PATCH the Ingredient "flour" with JSON:
      """
      {"shelfLifeDays": 10}
      """
    When I PATCH the Ingredient "flour" with JSON:
      """
      {"shelfLifeDays": 20, "frozenShelfLifeDays": 99999}
      """
    Then the response status is 400
    When I GET the Ingredient "flour"
    Then the response JSON field "shelfLifeDays" is "10"

  Scenario: Rename an Ingredient in a sheet
    When I PATCH the Ingredient "flour" with JSON:
      """
      {"name": "plain flour"}
      """
    Then the response status is 200
    And the response JSON field "name" is "plain flour"

  Scenario: A rename onto a name that is taken is refused with name_taken
    Given the Household has the Ingredient "plain flour" with Base Unit g
    When I PATCH the Ingredient "flour" with JSON:
      """
      {"name": "Plain  Flour"}
      """
    Then the response status is 409
    And the error code is "name_taken"
