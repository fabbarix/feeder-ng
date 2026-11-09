Feature: Finding Ingredients
  Search gives the exact match first, then fuzzy suggestions. Import Review and the
  "what is this?" sheet use it to avoid duplicate Ingredients.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Household has these Ingredients:
      | name           | baseUnit | shelfLifeDays | conversions |
      | tomato         | piece    |               |             |
      | passata        | ml       |               | jar=700     |
      | chicken thighs | g        |               |             |
      | red onion      | piece    |               |             |
      | onion          | piece    |               |             |

  Scenario: Exact match ignores case and spacing
    When I search Ingredients for "  Chicken   THIGHS "
    Then the response status is 200
    And the search exact match is "chicken thighs"
    And the search has no suggestions

  Scenario Outline: Typos, plurals and word order give suggestions
    When I search Ingredients for "<query>"
    Then the response status is 200
    And the search has no exact match
    And the first search suggestion is "<suggestion>"

    Examples:
      | query          | suggestion     |
      | tomatos        | tomato         |
      | tomatoes       | tomato         |
      | pasata         | passata        |
      | chicken thigh  | chicken thighs |
      | thighs chicken | chicken thighs |

  Scenario: Unrelated words suggest nothing
    When I search Ingredients for "zucchini"
    Then the search has no exact match
    And the search has no suggestions

  Scenario: Suggestions are best first and honour the limit
    When I search Ingredients for "onions"
    Then the first search suggestion is "onion"
    When I GET "/api/ingredients/search?q=onions&limit=1"
    Then the search has 1 suggestions

  Scenario: A blank query finds nothing
    When I GET "/api/ingredients/search?q=%20"
    Then the response status is 200
    And the search has no exact match
    And the search has no suggestions

  Scenario: The plain list can be filtered by a substring
    When I GET "/api/ingredients?q=ONION"
    Then the Ingredient list names are "onion, red onion"
