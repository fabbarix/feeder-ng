Feature: Typed Product barcode check
  A typed Product barcode made only of digits must be 8, 12, 13 or 14 digits long with a valid check digit; a code with
  letters stays accepted (decision SET 1). The server refuses what the form would (SET-04).

  Background:
    Given a running Feeder
    And an Ingredient "tomato passata" counted in g exists for Products
    And the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    And I am signed in as the User

  Scenario Outline: A mistyped digits-only barcode is refused with a field error
    When I send POST "/api/products/{product:Mutti passata}/barcodes" for Products with JSON:
      """
      {"code": "<code>"}
      """
    Then the response status is 400
    And the Products response value at "error.code" is "invalid_barcode"

    Examples:
      | code          |
      | 123           |
      | 12345678901   |
      | 8001234567890 |
      | 96385075      |

  Scenario Outline: A valid code is accepted
    When I send POST "/api/products/{product:Mutti passata}/barcodes" for Products with JSON:
      """
      {"code": "<code>"}
      """
    Then the response status is 201

    Examples:
      | code          |
      | 4006381333931 |
      | 96385074      |
      | 036000291452  |

  Scenario: A Shop's own code with letters is accepted as a barcode
    When I send POST "/api/products/{product:Mutti passata}/barcodes" for Products with JSON:
      """
      {"code": "PRIVATE-77"}
      """
    Then the response status is 201

  Scenario: A new Product with a mistyped barcode is refused and not created
    When I send POST "/api/products" for Products with JSON:
      """
      {"name": "Rice", "ingredientId": {ingredient:tomato passata}, "packSize": 1000, "barcodes": ["123"]}
      """
    Then the response status is 400
    And the Products response value at "error.code" is "invalid_barcode"
    When I GET "/api/products?q=Rice"
    Then the Products response has 0 entries
