Feature: Archiving Products
  A bought Product cannot be deleted, but it can be archived and later unarchived.
  An archived Product is left out of lists and pickers, is not matched by scans, is
  never suggested as the Product last bought, and keeps its purchase history, Prices
  and barcodes (so no new Product can claim them). A Product never bought can be deleted.

  Background:
    Given a running Feeder
    And an Ingredient "tomato passata" counted in g exists for Products
    And an Ingredient "ham" counted in g exists for Products
    And the Household shops at "Butcher"
    And the Household shops at "Corner Market"
    And the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 and global barcode "8001234567897" exists
    And the Product "Cirio passata" of Ingredient "tomato passata" with pack size 400 and global barcode "5901234123457" exists
    And the Product "Ham" of Ingredient "ham" with pack size 1000 exists
    And the Shop "Butcher" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    And at the Shop "Butcher" the item code "00123" of rule "21" is the Product "Ham"
    And at the Shop "Corner Market" the code "PRIVATE-77" is the Product "Mutti passata"
    And the Product "Mutti passata" cost 199 cents at the Shop "Corner Market" on 2026-11-01
    And the Product "Mutti passata" was bought at the Shop "Corner Market" on 2026-11-02
    And I am signed in as the User

  Scenario: Archiving leaves the Product out of the default list
    When I send POST "/api/products/{product:Mutti passata}/archive" for Products with JSON:
      """
      {}
      """
    Then the response status is 200
    And the Products response value at "archived" is "true"
    When I send GET "/api/products" for Products
    Then the response status is 200
    And the Products response has 2 entries
    When I send GET "/api/products?q=mutti" for Products
    Then the Products response has 0 entries
    When I send GET "/api/products?ingredient={ingredient:tomato passata}" for Products
    Then the Products response has 1 entries

  Scenario: includeArchived=1 lists archived Products too, flagged
    Given the Product "Mutti passata" is archived
    When I send GET "/api/products?includeArchived=1" for Products
    Then the Products response has 3 entries
    And the Products response value at "0.name" is "Cirio passata"
    And the Products response value at "0.archived" is "false"
    And the Products response value at "1.name" is "Ham"
    And the Products response value at "2.name" is "Mutti passata"
    And the Products response value at "2.archived" is "true"

  Scenario: An archived Product is still readable by id, with its history
    Given the Product "Mutti passata" is archived
    When I send GET "/api/products/{product:Mutti passata}" for Products
    Then the response status is 200
    And the Products response value at "archived" is "true"
    And the Products response value at "barcodes.0" is "08001234567897"
    And the Products response value at "latestPrices.0.priceCents" is "199"
    When I send GET "/api/products/{product:Mutti passata}/prices" for Products
    Then the Products response has 1 entries

  Scenario: Archiving twice is fine, and unarchive restores the Product
    Given the Product "Mutti passata" is archived
    When I send POST "/api/products/{product:Mutti passata}/archive" for Products with JSON:
      """
      {}
      """
    Then the response status is 200
    When I send POST "/api/products/{product:Mutti passata}/unarchive" for Products with JSON:
      """
      {}
      """
    Then the response status is 200
    And the Products response value at "archived" is "false"
    When I send GET "/api/products?q=mutti" for Products
    Then the Products response has 1 entries

  Scenario: Archiving an unknown Product
    When I send POST "/api/products/99999/archive" for Products with JSON:
      """
      {}
      """
    Then the response status is 404

  Scenario: Signed-out visitors cannot archive
    Given I am not signed in
    When I POST "/api/products/1/archive"
    Then the response status is 401

  Scenario: A bought Product can be archived but still not deleted
    Given the Product "Mutti passata" is archived
    When I send DELETE "/api/products/{product:Mutti passata}" for Products
    Then the response status is 409
    And the error code is "product_bought"
    And the Products response text contains "archive"

  Scenario: A Product that was never bought can be deleted, archived or not
    Given the Product "Cirio passata" is archived
    When I send DELETE "/api/products/{product:Cirio passata}" for Products
    Then the response status is 204
    When I send GET "/api/products?includeArchived=1" for Products
    Then the Products response has 2 entries

  Scenario: The Catalog leaves out an archived Product's barcodes
    Given the Product "Mutti passata" is archived
    And the Product "Ham" is archived
    When I send GET "/api/catalog?shop={shop:Corner Market}" for Products
    Then the response status is 200
    And the Products response value at "globalBarcodes.05901234123457" is "{product:Cirio passata}"
    And the Products response has no value at "globalBarcodes.08001234567897"
    And the Products response has no value at "shopBarcodes"
    When I send GET "/api/catalog?shop={shop:Butcher}" for Products
    Then the Products response has no value at "weightProducts"

  Scenario: Scanning an archived Product's barcode is unknown, naming the archived Product
    Given the Product "Mutti passata" is archived
    When I send GET "/api/resolve?barcode=8001234567897&format=ean_13" for Products
    Then the response status is 200
    And the Products response value at "resolution.outcome" is "unknown"
    And the Products response value at "product" is null
    And the Products response value at "archivedProduct.name" is "Mutti passata"
    And the Products response value at "archivedProduct.archived" is "true"

  Scenario: A Shop Barcode of an archived Product is unknown at its Shop
    Given the Product "Mutti passata" is archived
    When I send GET "/api/resolve?barcode=PRIVATE-77&format=code_128&shop={shop:Corner Market}" for Products
    Then the Products response value at "resolution.outcome" is "unknown"
    And the Products response value at "archivedProduct.name" is "Mutti passata"

  Scenario: A weighed Shop Barcode of an archived Product is an unknown weighed Product
    Given the Product "Ham" is archived
    When I send GET "/api/resolve?barcode=2100123007509&format=ean_13&shop={shop:Butcher}" for Products
    Then the Products response value at "resolution.outcome" is "unknown_weighed_product"
    And the Products response value at "archivedProduct.name" is "Ham"

  Scenario: A code nobody owns names no archived Product
    When I send GET "/api/resolve?barcode=4006381333931&format=ean_13" for Products
    Then the Products response value at "resolution.outcome" is "unknown"
    And the Products response value at "archivedProduct" is null

  Scenario: Unarchiving makes the barcode scan again
    Given the Product "Mutti passata" is archived
    When I send POST "/api/products/{product:Mutti passata}/unarchive" for Products with JSON:
      """
      {}
      """
    And I send GET "/api/resolve?barcode=8001234567897&format=ean_13" for Products
    Then the Products response value at "resolution.outcome" is "product"
    And the Products response value at "product.name" is "Mutti passata"

  Scenario: A new Product cannot claim an archived Product's barcode
    Given the Product "Mutti passata" is archived
    When I send POST "/api/products" for Products with JSON:
      """
      {"name": "Another passata", "ingredientId": {ingredient:tomato passata}, "packSize": 500,
       "barcodes": ["8001234567897"]}
      """
    Then the response status is 409
    And the error code is "barcode_archived"
    And the Products response text contains "product {product:Mutti passata}"
    When I send GET "/api/products?q=another" for Products
    Then the Products response has 0 entries

  Scenario: Adding an archived Product's barcode to another Product is refused the same way
    Given the Product "Mutti passata" is archived
    When I send POST "/api/products/{product:Cirio passata}/barcodes" for Products with JSON:
      """
      {"code": "8001234567897"}
      """
    Then the response status is 409
    And the error code is "barcode_archived"

  Scenario: The owner of a barcode can be found even if archived, to offer unarchive
    Given the Product "Mutti passata" is archived
    When I send GET "/api/products?barcode=8001234567897&includeArchived=1" for Products
    Then the Products response has 1 entries
    And the Products response value at "0.archived" is "true"
    When I send GET "/api/products?barcode=8001234567897" for Products
    Then the Products response has 0 entries

  Scenario: An archived Product is never suggested as the Product last bought
    Given the Product "Cirio passata" was bought at the Shop "Butcher" on 2026-10-01
    And the Product "Mutti passata" is archived
    When I send GET "/api/products/last-bought?ingredient={ingredient:tomato passata}" for Products
    Then the response status is 200
    And the Products response value at "name" is "Cirio passata"
    When I send GET "/api/products/last-bought?ingredients={ingredient:tomato passata},{ingredient:ham}" for Products
    Then the Products response value at "{ingredient:tomato passata}.name" is "Cirio passata"

  Scenario: With every bought Product archived there is no suggestion
    Given the Product "Mutti passata" is archived
    When I send GET "/api/products/last-bought?ingredient={ingredient:tomato passata}" for Products
    Then the response status is 404

  Scenario: A late purchase or Price for an archived Product is still recorded
    Given the Product "Cirio passata" is archived
    When I send POST "/api/purchases" for Products with JSON:
      """
      {"productId": {product:Cirio passata}, "shopId": {shop:Butcher}, "date": "2026-11-09"}
      """
    Then the response status is 201
    When I send PUT "/api/products/{product:Cirio passata}/prices" for Products with JSON:
      """
      {"shopId": {shop:Butcher}, "date": "2026-11-09", "priceCents": 120}
      """
    Then the response status is 200
