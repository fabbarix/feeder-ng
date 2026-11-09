Feature: Ingredients
  The Household keeps a list of Ingredients. Each has a name (unique once case and
  spacing are ignored), a Base Unit, Unit Conversions and an optional Shelf Life.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: Create an Ingredient with a conversion and a Shelf Life
    When I POST "/api/ingredients" with JSON:
      """
      {"name": "Garlic", "baseUnit": "g", "shelfLifeDays": 30,
       "conversions": [{"unit": "clove", "toBase": 5}]}
      """
    Then the response status is 201
    And the response JSON field "name" is "Garlic"
    And the response JSON field "baseUnit" is "g"
    And the response JSON field "shelfLifeDays" is "30"
    And the Ingredient response conversions are:
      | unit  | toBase |
      | clove | 5      |

  Scenario: A new Ingredient has no Shelf Life unless one is given
    When I POST "/api/ingredients" with JSON:
      """
      {"name": "salt", "baseUnit": "g"}
      """
    Then the response status is 201
    And the Ingredient response has no Shelf Life
    And the Ingredient response conversions are:
      | unit | toBase |

  Scenario Outline: Names are unique ignoring case and spacing
    Given the Household has the Ingredient "Red Onion" with Base Unit piece
    When I POST "/api/ingredients" with JSON:
      """
      {"name": "<name>", "baseUnit": "piece"}
      """
    Then the response status is 409
    And the error code is "name_taken"

    Examples:
      | name           |
      | red onion      |
      | RED ONION      |
      |   Red   Onion  |

  Scenario Outline: Invalid Ingredients are refused
    When I POST "/api/ingredients" with JSON:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "invalid_ingredient"

    Examples:
      | body                                                                                 |
      | {"name": "  ", "baseUnit": "g"}                                                      |
      | {"name": "flour", "baseUnit": "kg"}                                                  |
      | {"name": "flour", "baseUnit": "g", "shelfLifeDays": 0}                               |
      | {"name": "flour", "baseUnit": "g", "conversions": [{"unit": "cup", "toBase": 0}]}    |
      | {"name": "flour", "baseUnit": "g", "conversions": [{"unit": "g", "toBase": 1}]}      |

  Scenario: Malformed JSON is a bad request
    When I POST "/api/ingredients" with JSON:
      """
      not json
      """
    Then the response status is 400
    And the error code is "bad_request"

  Scenario: The list is ordered by name, ignoring case
    Given the Household has these Ingredients:
      | name     | baseUnit | shelfLifeDays | conversions |
      | Zucchini | piece    |               |             |
      | apple    | piece    |               |             |
      | Milk     | ml       | 7             | cup=240     |
    When I GET "/api/ingredients"
    Then the response status is 200
    And the Ingredient list names are "apple, Milk, Zucchini"

  Scenario: Rename keeps the Ingredient and everything that points at it
    Given the Household has the Ingredient "scallion" with Base Unit g
    And the Ingredient "scallion" is referenced 3 times by other features
    When I PATCH the Ingredient "scallion" with JSON:
      """
      {"name": "Spring Onion"}
      """
    Then the response status is 200
    And the response JSON field "name" is "Spring Onion"
    And the Ingredient "scallion" has 3 references from other features

  Scenario: Renaming onto another Ingredient's name is refused
    Given the Household has these Ingredients:
      | name    | baseUnit | shelfLifeDays | conversions |
      | onion   | piece    |               |             |
      | shallot | piece    |               |             |
    When I PATCH the Ingredient "shallot" with JSON:
      """
      {"name": " Onion "}
      """
    Then the response status is 409
    And the error code is "name_taken"

  Scenario: Set and clear the Shelf Life
    Given the Household has the Ingredient "milk" with Base Unit ml
    When I PATCH the Ingredient "milk" with JSON:
      """
      {"shelfLifeDays": 7}
      """
    Then the response JSON field "shelfLifeDays" is "7"
    When I PATCH the Ingredient "milk" with JSON:
      """
      {"shelfLifeDays": null}
      """
    Then the response status is 200
    And the Ingredient response has no Shelf Life

  Scenario: Add and remove a Unit Conversion
    Given the Household has the Ingredient "garlic" with Base Unit g
    When I PUT the conversion "Clove" of the Ingredient "garlic" with JSON:
      """
      {"toBase": 5}
      """
    Then the response status is 200
    And the Ingredient response conversions are:
      | unit  | toBase |
      | clove | 5      |
    When I DELETE the conversion "clove" of the Ingredient "garlic"
    Then the response status is 200
    And the Ingredient response conversions are:
      | unit | toBase |

  Scenario: The Base Unit cannot change while other features use the Ingredient
    Given the Household has the Ingredient "egg" with Base Unit piece
    And the Ingredient "egg" is referenced 1 times by other features
    When I PATCH the Ingredient "egg" with JSON:
      """
      {"baseUnit": "g"}
      """
    Then the response status is 409
    And the error code is "in_use"

  Scenario: The Base Unit can change while nothing uses the Ingredient
    Given the Household has the Ingredient "egg" with Base Unit piece
    When I PATCH the Ingredient "egg" with JSON:
      """
      {"baseUnit": "g"}
      """
    Then the response status is 200
    And the response JSON field "baseUnit" is "g"

  Scenario: An Ingredient page reports what uses it
    Given the Household has the Ingredient "garlic" with Base Unit g
    And the Ingredient "garlic" is referenced 2 times by other features
    When I GET the Ingredient "garlic"
    Then the response status is 200
    And the response JSON field "references.bdd test references" is "2"

  Scenario: Delete an unused Ingredient
    Given the Household has the Ingredient "garlic" with Base Unit g
    When I DELETE the Ingredient "garlic"
    Then the response status is 204
    When I GET the Ingredient "garlic"
    Then the response status is 404
    And the error code is "not_found"

  Scenario: An Ingredient in use cannot be deleted
    Given the Household has the Ingredient "garlic" with Base Unit g
    And the Ingredient "garlic" is referenced 1 times by other features
    When I DELETE the Ingredient "garlic"
    Then the response status is 409
    And the error code is "in_use"

  Scenario: Ingredients need a signed-in User
    Given I am not signed in
    When I GET "/api/ingredients"
    Then the response status is 401
    When I POST "/api/ingredients" with JSON:
      """
      {"name": "salt", "baseUnit": "g"}
      """
    Then the response status is 401
