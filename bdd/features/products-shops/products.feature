Feature: Products
  A Product is a specific purchasable pack that supplies one Ingredient. It has a pack
  size in the Ingredient's Base Unit, optional global barcodes, and the Shops known to sell it.

  Background:
    Given a running Feeder
    And an Ingredient "tomato passata" counted in g exists for Products
    And an Ingredient "milk" counted in ml exists for Products
    And I am signed in as the User

  Scenario: Create a Product from an Ingredient's page
    When I send POST "/api/products" for Products with JSON:
      """
      {"name": "Mutti passata 700 g", "ingredientId": {ingredient:tomato passata}, "packSize": 700,
       "barcodes": ["8001234567897"]}
      """
    Then the response status is 201
    And the Products response value at "name" is "Mutti passata 700 g"
    And the Products response value at "ingredientName" is "tomato passata"
    And the Products response value at "baseUnit" is "g"
    And the Products response value at "packSize" is "700"
    And the Products response value at "barcodes.0" is "08001234567897"

  Scenario: Create a Product with a Shop-only code in one go (the unknown-barcode sheet)
    Given the Household shops at "Corner Market"
    When I send POST "/api/products" for Products with JSON:
      """
      {"name": "Corner passata", "ingredientId": {ingredient:tomato passata}, "packSize": 500,
       "shopBarcodes": [{"shopId": {shop:Corner Market}, "code": "PRIVATE-77"}]}
      """
    Then the response status is 201
    And the Products response has 0 entries at "barcodes"
    And the Products response value at "shopBarcodes.0.code" is "PRIVATE-77"
    And the Products response value at "shops.0.name" is "Corner Market"

  Scenario Outline: Invalid Products are refused
    When I send POST "/api/products" for Products with JSON:
      """
      <body>
      """
    Then the response status is <status>
    And the error code is "<code>"

    Examples:
      | body                                                                                      | status | code               |
      | {"name": "  ", "ingredientId": {ingredient:milk}, "packSize": 1000}                       | 400    | invalid_product    |
      | {"name": "Milk", "ingredientId": {ingredient:milk}, "packSize": 0}                        | 400    | invalid_product    |
      | {"name": "Milk", "ingredientId": {ingredient:milk}, "packSize": -3}                       | 400    | invalid_product    |
      | {"name": "Milk", "ingredientId": 99999, "packSize": 1000}                                 | 400    | unknown_ingredient |
      | {"name": "Milk", "ingredientId": {ingredient:milk}, "packSize": 1000, "barcodes": ["8001234567890"]} | 400    | invalid_barcode    |

  Scenario: A global barcode belongs to one Product only
    Given the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 and global barcode "8001234567897" exists
    When I send POST "/api/products" for Products with JSON:
      """
      {"name": "Copycat", "ingredientId": {ingredient:tomato passata}, "packSize": 700, "barcodes": ["5901234123457", "8001234567897"]}
      """
    Then the response status is 409
    And the error code is "barcode_taken"
    When I GET "/api/products"
    Then the Products response has 1 entries

  Scenario: Look a Product up by barcode, written in any equivalent form
    Given the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 and global barcode "8001234567897" exists
    When I GET "/api/products?barcode=08001234567897"
    Then the Products response has 1 entries
    And the Products response value at "0.name" is "Mutti passata"
    When I GET "/api/products?barcode=5901234123457"
    Then the Products response has 0 entries

  Scenario: Search by name and by Ingredient
    Given the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    And the Product "Whole milk 1 l" of Ingredient "milk" with pack size 1000 exists
    When I GET "/api/products?q=PASSATA"
    Then the Products response has 1 entries
    When I send GET "/api/products?ingredient={ingredient:milk}" for Products
    Then the Products response has 1 entries
    And the Products response value at "0.name" is "Whole milk 1 l"

  Scenario: Add and remove a global barcode
    Given the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    When I send POST "/api/products/{product:Mutti passata}/barcodes" for Products with JSON:
      """
      {"code": "8001234567897"}
      """
    Then the response status is 201
    When I send GET "/api/products/{product:Mutti passata}" for Products
    Then the Products response value at "barcodes.0" is "08001234567897"
    When I send DELETE "/api/products/{product:Mutti passata}/barcodes/08001234567897" for Products
    Then the response status is 204
    When I send GET "/api/products/{product:Mutti passata}" for Products
    Then the Products response has 0 entries at "barcodes"

  Scenario: Rename a Product and change its pack size; the Ingredient is fixed
    Given the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    When I send PATCH "/api/products/{product:Mutti passata}" for Products with JSON:
      """
      {"name": "Mutti passata 500 g", "packSize": 500}
      """
    Then the response status is 200
    And the Products response value at "name" is "Mutti passata 500 g"
    And the Products response value at "packSize" is "500"
    And the Products response value at "ingredientId" is "{ingredient:tomato passata}"

  Scenario: A Shop is known to sell a Product, and can be forgotten
    Given the Household shops at "Corner Market"
    And the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    When I send PUT "/api/products/{product:Mutti passata}/shops/{shop:Corner Market}" for Products with JSON:
      """
      {}
      """
    Then the response status is 204
    When I send GET "/api/products/{product:Mutti passata}" for Products
    Then the Products response value at "shops.0.name" is "Corner Market"
    When I send DELETE "/api/products/{product:Mutti passata}/shops/{shop:Corner Market}" for Products
    Then the response status is 204
    When I send GET "/api/products/{product:Mutti passata}" for Products
    Then the Products response has 0 entries at "shops"

  Scenario: Delete a Product that was never bought
    Given the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    When I send DELETE "/api/products/{product:Mutti passata}" for Products
    Then the response status is 204
    When I send GET "/api/products/{product:Mutti passata}" for Products
    Then the response status is 404

  Scenario: A bought Product cannot be deleted
    Given the Household shops at "Corner Market"
    And the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    And the Product "Mutti passata" was bought at the Shop "Corner Market" on 2026-11-08
    When I send DELETE "/api/products/{product:Mutti passata}" for Products
    Then the response status is 409
    And the error code is "in_use"

  Scenario: Signed-out visitors cannot list Products
    Given I am not signed in
    When I GET "/api/products"
    Then the response status is 401
