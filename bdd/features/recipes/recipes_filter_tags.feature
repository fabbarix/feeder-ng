Feature: Filter Recipes by several Tags
  The Recipes list can be narrowed by more than one Tag. A Recipe has to carry every selected Tag (like combining filter
  sections, each Tag narrows the list). One Tag works as before. (docs/design/recipes-filter.md, docs/dev/design/b8-recipes.md)

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Ingredient "flour" exists with Base Unit "g"
    And I have created the Recipe "Fish pie" tagged "fish, oven"
    And I have created the Recipe "Fish fingers" tagged "fish, quick"
    And I have created the Recipe "Roast" tagged "oven"

  Scenario: One Tag still narrows the list
    When I list the Recipes with the filter "tag=fish"
    Then the Recipe names are "Fish fingers, Fish pie"

  Scenario: Two Tags need both
    When I list the Recipes with the filter "tag=fish&tag=oven"
    Then the Recipe names are "Fish pie"

  Scenario: The order of the Tags does not matter and the spelling is not case sensitive
    When I list the Recipes with the filter "tag=OVEN&tag=Fish"
    Then the Recipe names are "Fish pie"

  Scenario: Two Tags no Recipe carries together give an empty list
    When I list the Recipes with the filter "tag=quick&tag=oven"
    Then the Recipe names are ""

  Scenario: A repeated Tag counts once
    When I list the Recipes with the filter "tag=fish&tag=Fish"
    Then the Recipe names are "Fish fingers, Fish pie"

  Scenario: A Tag combines with a search
    When I list the Recipes with the filter "tag=fish&tag=oven&q=pie"
    Then the Recipe names are "Fish pie"
