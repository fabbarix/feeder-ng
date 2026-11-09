Feature: Weight Barcode Rules
  A Shop's Weight Barcode Rules say how to read the Product and the weight or price
  from its variable-weight barcodes. The Admin manages them; every User can read them.

  Background:
    Given a running Feeder
    And the Household shops at "Butcher"

  Scenario: The Admin adds a weight rule in kg with three decimal places
    Given I am signed in as the Admin
    When I send POST "/api/shops/{shop:Butcher}/weight-rules" for Products with JSON:
      """
      {"prefix": "21", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5},
       "valueKind": "weight", "valueUnit": "kg", "decimalPlaces": 3}
      """
    Then the response status is 201
    And the Products response value at "prefix" is "21"
    And the Products response value at "valueUnit" is "kg"
    And the Products response value at "shopId" is "{shop:Butcher}"

  Scenario: The Admin adds a price rule, whose value is in the minor currency unit
    Given I am signed in as the Admin
    When I send POST "/api/shops/{shop:Butcher}/weight-rules" for Products with JSON:
      """
      {"prefix": "22", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5},
       "valueKind": "price", "decimalPlaces": 0}
      """
    Then the response status is 201
    And the Products response value at "valueKind" is "price"

  Scenario Outline: A rule that cannot work is refused
    Given I am signed in as the Admin
    When I send POST "/api/shops/{shop:Butcher}/weight-rules" for Products with JSON:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "invalid_rule"

    Examples:
      | body                                                                                                                                                       |
      | {"prefix": "21", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "weight", "valueUnit": "stone", "decimalPlaces": 0}    |
      | {"prefix": "21", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "price", "valueUnit": "g", "decimalPlaces": 0}        |
      | {"prefix": "21", "item": {"start": 3, "length": 5}, "value": {"start": 6, "length": 5}, "valueKind": "weight", "decimalPlaces": 0}                         |
      | {"prefix": "21", "item": {"start": 2, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "weight", "decimalPlaces": 0}                         |
      | {"prefix": "21", "item": {"start": 3, "length": 5}, "value": {"start": 9, "length": 5}, "valueKind": "weight", "decimalPlaces": 0}                         |
      | {"prefix": "21", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "weight", "decimalPlaces": 6}                         |
      | {"prefix": "2x", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "weight", "decimalPlaces": 0}                         |
      | {"prefix": "21", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "volume", "decimalPlaces": 0}                         |

  Scenario: One prefix per Shop, but overlapping prefixes are fine
    Given the Shop "Butcher" has a weight rule with prefix "29", item digits 8-12, value digits 3-7, unit "g" and 0 decimal places
    And I am signed in as the Admin
    When I send POST "/api/shops/{shop:Butcher}/weight-rules" for Products with JSON:
      """
      {"prefix": "29", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "weight", "decimalPlaces": 0}
      """
    Then the response status is 409
    And the error code is "duplicate_prefix"
    When I send POST "/api/shops/{shop:Butcher}/weight-rules" for Products with JSON:
      """
      {"prefix": "290", "item": {"start": 4, "length": 5}, "value": {"start": 9, "length": 4}, "valueKind": "weight", "decimalPlaces": 0}
      """
    Then the response status is 201

  Scenario: Another Shop may use the same prefix
    Given the Shop "Butcher" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    And the Household shops at "Deli"
    And I am signed in as the Admin
    When I send POST "/api/shops/{shop:Deli}/weight-rules" for Products with JSON:
      """
      {"prefix": "21", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "weight", "decimalPlaces": 0}
      """
    Then the response status is 201

  Scenario: A User can read the rules but not change them
    Given the Shop "Butcher" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    And I am signed in as the User
    When I send GET "/api/shops/{shop:Butcher}/weight-rules" for Products
    Then the response status is 200
    And the Products response has 1 entries
    When I send POST "/api/shops/{shop:Butcher}/weight-rules" for Products with JSON:
      """
      {"prefix": "22", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "weight", "decimalPlaces": 0}
      """
    Then the response status is 403
    When I send DELETE "/api/weight-rules/{rule:Butcher/21}" for Products
    Then the response status is 403

  Scenario: Changing the unit of a rule that is in use is fine, changing the item length is not
    Given an Ingredient "ham" counted in g exists for Products
    And the Product "Ham" of Ingredient "ham" with pack size 1000 exists
    And the Shop "Butcher" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    And at the Shop "Butcher" the item code "00123" of rule "21" is the Product "Ham"
    And I am signed in as the Admin
    When I send PUT "/api/weight-rules/{rule:Butcher/21}" for Products with JSON:
      """
      {"prefix": "21", "item": {"start": 3, "length": 5}, "value": {"start": 8, "length": 5}, "valueKind": "weight", "valueUnit": "kg", "decimalPlaces": 3}
      """
    Then the response status is 200
    And the Products response value at "valueUnit" is "kg"
    When I send PUT "/api/weight-rules/{rule:Butcher/21}" for Products with JSON:
      """
      {"prefix": "21", "item": {"start": 3, "length": 4}, "value": {"start": 8, "length": 5}, "valueKind": "weight", "valueUnit": "kg", "decimalPlaces": 3}
      """
    Then the response status is 409
    And the error code is "in_use"

  Scenario: Deleting a rule deletes the weighed Shop Barcodes that use it
    Given an Ingredient "ham" counted in g exists for Products
    And the Product "Ham" of Ingredient "ham" with pack size 1000 exists
    And the Shop "Butcher" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    And at the Shop "Butcher" the item code "00123" of rule "21" is the Product "Ham"
    And I am signed in as the Admin
    When I send DELETE "/api/weight-rules/{rule:Butcher/21}" for Products
    Then the response status is 204
    When I send GET "/api/shops/{shop:Butcher}/barcodes" for Products
    Then the Products response has 0 entries
