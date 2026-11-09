Feature: Import Review
  Importing never writes directly. A file is validated, its Ingredients and units are
  matched, Recipe conflicts are answered, images are resolved, and Confirm saves all in one go.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: The example file is ready to import into an empty household
    When I review the example Recipe File
    Then the response status is 201
    And the review is ready
    And the review lists the Ingredient "garam masala" as "new"
    And the review lists 9 Ingredients and 2 Recipes
    When I confirm the review with no answers
    Then the response status is 200
    And the household has the Recipes "Chicken tikka traybake, Lasagne (ready meal)"
    And the stored Ingredient "garam masala" has the Unit Conversion "tbsp" = 6
    And the Recipe "Chicken tikka traybake" has 8 lines and 6 Steps

  Scenario: Schema errors are listed with their JSON path and nothing is imported
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "recipes": [{"name": "Soup", "yield": 0,
                    "ingredients": [{"ingredient": "water", "quantity": -1, "unit": "ml"}]}]}
      """
    Then the response status is 422
    And the error code is "invalid_recipe_file"
    And the file errors include the path "$.recipes[0].yield"
    And the file errors include the path "$.recipes[0].ingredients[0].quantity"

  Scenario Outline: Unknown versions and broken JSON are rejected
    When I review the text <text>
    Then the response status is 422
    And the error code is "<code>"

    Examples:
      | text                                                                | code                |
      | {"format":"feeder-recipe-file","version":2,"recipes":[]}            | unsupported_version |
      | {"format":"feeder-recipe-file","version":"1","recipes":[]}          | unsupported_version |
      | nonsense                                                            | invalid_json        |

  Scenario: Ingredient names match exactly, ignoring case and spacing
    Given the household already has the Ingredient "  Red   Pepper " with Base Unit "piece"
    When I review the example Recipe File
    Then the review lists the Ingredient "red pepper" as "exact"
    When I confirm the review with no answers
    Then the household has 9 Ingredients

  Scenario: Near matches are offered as suggestions and the default is to create
    Given the household already has the Ingredient "chicken thigh" with Base Unit "g"
    When I review the example Recipe File
    Then the review lists the Ingredient "chicken thighs" as "suggested"
    And the first suggestion for "chicken thighs" is "chicken thigh"
    When I answer the review with:
      """
      {"decisions": {"ingredients": [{"key": "chicken thighs", "action": "use", "ingredientId": <id:chicken thigh>}]}}
      """
    And I confirm the review with the same answers
    Then the household has 9 Ingredients
    And the Recipe "Chicken tikka traybake" uses the Ingredient "chicken thigh"

  Scenario: A Base Unit conflict is resolved by hand, and the unit check follows
    Given the household already has the Ingredient "onion" with Base Unit "g"
    When I review the example Recipe File
    Then the review lists the Ingredient "onion" as "conflict"
    And the review is not ready
    When I confirm the review with no answers
    Then the response status is 422
    And the error code is "import_not_ready"
    When I answer the review with:
      """
      {"decisions": {"ingredients": [{"key": "onion", "action": "use", "ingredientId": <id:onion>}]}}
      """
    Then the review asks for a Unit Conversion of "piece" for "onion"
    And the review is not ready
    When I answer the review with:
      """
      {"decisions": {"ingredients": [{"key": "onion", "action": "use", "ingredientId": <id:onion>}],
                     "conversions": [{"key": "onion", "unit": "piece", "toBase": 150}]}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 200
    And the stored Ingredient "onion" has the Unit Conversion "piece" = 150

  Scenario: A Base Unit conflict can also be resolved by creating the Ingredient under another name
    Given the household already has the Ingredient "onion" with Base Unit "g"
    When I review the example Recipe File
    And I answer the review with:
      """
      {"decisions": {"ingredients": [{"key": "onion", "action": "create", "name": "onion (whole)"}]}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the stored Ingredient "onion (whole)" has Base Unit "piece"
    And the stored Ingredient "onion" has Base Unit "g"

  Scenario: An unconvertible unit gets a one-off conversion prompt, once however often it is used
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "ingredients": [{"name": "spinach", "baseUnit": "g"}],
       "recipes": [{"name": "Greens", "yield": 2,
                    "ingredients": [{"ingredient": "spinach", "quantity": 2, "unit": "handful"}],
                    "steps": [{"text": "Wilt", "kind": "active", "uses": [{"ingredient": "spinach", "quantity": 1, "unit": "handful"}]}]}]}
      """
    Then the review asks for a Unit Conversion of "handful" for "spinach"
    And the review has 1 Unit Conversion prompt
    When I answer the review with:
      """
      {"decisions": {"conversions": [{"key": "spinach", "unit": "handful", "toBase": 0}]}}
      """
    Then the review is not ready
    When I answer the review with:
      """
      {"decisions": {"conversions": [{"key": "spinach", "unit": "handful", "toBase": 30}]}}
      """
    And I confirm the review with the same answers
    Then the stored Ingredient "spinach" has the Unit Conversion "handful" = 30

  Scenario: A Recipe with the same name needs an answer: replace
    Given the household already has the Recipe "chicken tikka traybake"
    When I review the example Recipe File
    Then the review has a conflict for the Recipe "Chicken tikka traybake"
    And the review is not ready
    When I answer the review with:
      """
      {"decisions": {"recipes": [{"index": 0, "action": "replace"}]}}
      """
    And I confirm the review with the same answers
    Then the household has the Recipes "Chicken tikka traybake, Lasagne (ready meal)"
    And the Recipe "Chicken tikka traybake" keeps its id
    And the Recipe "Chicken tikka traybake" has 8 lines and 6 Steps

  Scenario: A Recipe with the same name: keep both
    Given the household already has the Recipe "Chicken tikka traybake"
    When I review the example Recipe File
    And I answer the review with:
      """
      {"decisions": {"recipes": [{"index": 0, "action": "keep_both"}]}}
      """
    And I confirm the review with the same answers
    Then the household has the Recipes "Chicken tikka traybake, Chicken tikka traybake (2), Lasagne (ready meal)"

  Scenario: A Recipe with the same name: skip, and its Ingredients are not created
    Given the household already has the Recipe "Chicken tikka traybake"
    When I review the example Recipe File
    And I answer the review with:
      """
      {"decisions": {"recipes": [{"index": 0, "action": "skip"}]}}
      """
    And I confirm the review with the same answers
    Then the household has the Recipes "Chicken tikka traybake, Lasagne (ready meal)"
    And the household has no Ingredient "spinach"
    And the household has the Ingredient "lasagne ready meal"

  Scenario: An image from a private address is a warning, never fetched
    When I review this Recipe File:
      """
      {"format": "feeder-recipe-file", "version": 1,
       "ingredients": [{"name": "water", "baseUnit": "ml"}],
       "recipes": [{"name": "Soup", "yield": 1, "image": "https://169.254.169.254/latest/meta-data/",
                    "ingredients": [{"ingredient": "water", "quantity": 1, "unit": "ml"}],
                    "steps": [{"text": "Boil", "kind": "active", "image": "https://127.0.0.1:1/a.png"}]}]}
      """
    Then the review is ready
    And the review has a warning at "$.recipes[0].image"
    And the review has a warning at "$.recipes[0].steps[0].image"
    When I confirm the review with no answers
    Then the Recipe "Soup" has no photo

  Scenario: Confirm saves nothing when the data changed after the review
    Given the household already has the Recipe "Chicken tikka traybake"
    When I review the example Recipe File
    And I answer the review with:
      """
      {"decisions": {"recipes": [{"index": 0, "action": "replace"}]}}
      """
    And the Recipe "Chicken tikka traybake" is deleted behind the review's back
    And I confirm the review with the same answers
    Then the response status is 409
    And the error code is "import_stale"
    And the household has 0 Recipes
    And the household has 1 Ingredient

  Scenario: Another User cannot use my review
    When I review the example Recipe File
    And I am signed in as the Admin
    And I confirm the review with no answers
    Then the response status is 404
