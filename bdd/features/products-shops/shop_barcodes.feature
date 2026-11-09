Feature: Shop Barcodes
  A Shop Barcode identifies a Product only within one Shop: an own-label code, or the item
  code of a Weight Barcode Rule. Any User can add them (the scan sheet does).

  Background:
    Given a running Feeder
    And an Ingredient "ham" counted in g exists for Products
    And the Household shops at "Butcher"
    And the Household shops at "Deli"
    And the Product "Ham" of Ingredient "ham" with pack size 1000 exists
    And the Product "Cheese" of Ingredient "ham" with pack size 500 exists
    And I am signed in as the User

  Scenario: Add an own-label code; it also records the Product as sold at the Shop
    When I send POST "/api/shops/{shop:Butcher}/barcodes" for Products with JSON:
      """
      {"productId": {product:Ham}, "code": " PRIVATE-77 "}
      """
    Then the response status is 201
    And the Products response value at "code" is "PRIVATE-77"
    When I send GET "/api/products/{product:Ham}" for Products
    Then the Products response value at "shops.0.name" is "Butcher"

  Scenario: The same code may exist in two Shops but not twice in one
    Given at the Shop "Butcher" the code "PRIVATE-77" is the Product "Ham"
    When I send POST "/api/shops/{shop:Deli}/barcodes" for Products with JSON:
      """
      {"productId": {product:Cheese}, "code": "PRIVATE-77"}
      """
    Then the response status is 201
    When I send POST "/api/shops/{shop:Butcher}/barcodes" for Products with JSON:
      """
      {"productId": {product:Cheese}, "code": "PRIVATE-77"}
      """
    Then the response status is 409
    And the error code is "barcode_taken"

  Scenario: A code that is not readable is refused
    When I send POST "/api/shops/{shop:Butcher}/barcodes" for Products with JSON:
      """
      {"productId": {product:Ham}, "code": "8001234567890"}
      """
    Then the response status is 400
    And the error code is "invalid_barcode"

  Scenario: Map a rule's item code to a Product
    Given the Shop "Butcher" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    When I send POST "/api/shops/{shop:Butcher}/barcodes" for Products with JSON:
      """
      {"productId": {product:Ham}, "ruleId": {rule:Butcher/21}, "itemCode": "00123"}
      """
    Then the response status is 201
    And the Products response value at "itemCode" is "00123"
    And the Products response value at "ruleId" is "{rule:Butcher/21}"

  Scenario Outline: The item code must fit the rule's item digits
    Given the Shop "Butcher" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    When I send POST "/api/shops/{shop:Butcher}/barcodes" for Products with JSON:
      """
      {"productId": {product:Ham}, "ruleId": {rule:Butcher/21}, "itemCode": "<item>"}
      """
    Then the response status is 400
    And the error code is "invalid_item_code"

    Examples:
      | item   |
      | 123    |
      | 001234 |
      | 00x23  |

  Scenario: A rule belongs to its Shop
    Given the Shop "Butcher" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    When I send POST "/api/shops/{shop:Deli}/barcodes" for Products with JSON:
      """
      {"productId": {product:Ham}, "ruleId": {rule:Butcher/21}, "itemCode": "00123"}
      """
    Then the response status is 404

  Scenario: List and delete
    Given at the Shop "Butcher" the code "PRIVATE-77" is the Product "Ham"
    When I send GET "/api/shops/{shop:Butcher}/barcodes" for Products
    Then the Products response has 1 entries
    When I send DELETE "/api/shop-barcodes/{shopbarcode:Butcher/PRIVATE-77}" for Products
    Then the response status is 204
    When I send GET "/api/shops/{shop:Butcher}/barcodes" for Products
    Then the Products response has 0 entries
