Feature: Catalog and barcode resolution
  The Catalog is what the phone caches for one Shop (or for home). Resolution at a Shop
  goes: that Shop's Shop Barcode, that Shop's Weight Barcode Rules, global barcode, unknown.
  At home only global barcodes apply.

  Background:
    Given a running Feeder
    And an Ingredient "tomato passata" counted in g exists for Products
    And an Ingredient "ham" counted in g exists for Products
    And the Household shops at "Butcher"
    And the Household shops at "Corner Market"
    And the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 and global barcode "8001234567897" exists
    And the Product "Ham" of Ingredient "ham" with pack size 1000 exists
    And the Product "Cooked ham" of Ingredient "ham" with pack size 1000 exists
    And the Shop "Butcher" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    And the Shop "Butcher" has a price rule with prefix "22", item digits 3-7, value digits 8-12, unit "" and 0 decimal places
    And at the Shop "Butcher" the item code "00123" of rule "21" is the Product "Ham"
    And at the Shop "Butcher" the item code "00123" of rule "22" is the Product "Cooked ham"
    And at the Shop "Corner Market" the code "PRIVATE-77" is the Product "Mutti passata"
    And I am signed in as the User

  Scenario: The Catalog of a Shop holds only that Shop's data plus every global barcode
    When I send GET "/api/catalog?shop={shop:Butcher}" for Products
    Then the response status is 200
    And the Products response has 2 entries at "weightRules"
    And the Products response value at "weightProducts.{rule:Butcher/21}:00123" is "{product:Ham}"
    And the Products response value at "globalBarcodes.08001234567897" is "{product:Mutti passata}"
    And the Products response has no value at "shopBarcodes"

  Scenario: The Catalog of another Shop has its own Shop Barcodes
    When I send GET "/api/catalog?shop={shop:Corner Market}" for Products
    Then the Products response value at "shopBarcodes.PRIVATE-77" is "{product:Mutti passata}"
    And the Products response has no value at "weightRules"

  Scenario: The Catalog at home has global barcodes only
    When I GET "/api/catalog"
    Then the response status is 200
    And the Products response value at "globalBarcodes.08001234567897" is "{product:Mutti passata}"
    And the Products response has no value at "weightRules"
    And the Products response has no value at "shopBarcodes"
    And the Products response has no value at "weightProducts"

  Scenario: The Catalog carries the latest price per kg at the Shop for its weighed Products
    Given the Product "Cooked ham" cost 1500 cents per kg at the Shop "Butcher" on 2026-10-01
    And the Product "Cooked ham" cost 1800 cents per kg at the Shop "Butcher" on 2026-11-01
    And the Product "Cooked ham" cost 2500 cents per kg at the Shop "Corner Market" on 2026-11-08
    When I send GET "/api/catalog?shop={shop:Butcher}" for Products
    Then the Products response value at "pricePerKgCents.{product:Cooked ham}" is "1800"
    And the Products response has no value at "pricePerKgCents.{product:Mutti passata}"

  Scenario: An unknown Shop has no Catalog
    When I GET "/api/catalog?shop=99999"
    Then the response status is 404

  Scenario: A weight-valued Weight Barcode Rule decodes the weight
    When I send GET "/api/resolve?barcode=2100123007509&format=ean_13&shop={shop:Butcher}" for Products
    Then the response status is 200
    And the Products response value at "resolution.outcome" is "weighed"
    And the Products response value at "resolution.via" is "weight_rule"
    And the Products response value at "resolution.weightGrams" is "750"
    And the Products response value at "resolution.productId" is "{product:Ham}"
    And the Products response value at "product.name" is "Ham"

  Scenario: A price-valued rule derives the weight from the last price per kg at that Shop
    Given the Product "Cooked ham" cost 1800 cents per kg at the Shop "Butcher" on 2026-11-01
    When I send GET "/api/resolve?barcode=2200123004505&format=ean_13&shop={shop:Butcher}" for Products
    Then the Products response value at "resolution.outcome" is "weighed"
    And the Products response value at "resolution.priceCents" is "450"
    And the Products response value at "resolution.pricePerKgCents" is "1800"
    And the Products response value at "resolution.weightGrams" is "250"

  Scenario: A price-valued rule without a price per kg asks for the weight once
    When I send GET "/api/resolve?barcode=2200123004505&format=ean_13&shop={shop:Butcher}" for Products
    Then the Products response value at "resolution.outcome" is "ask_weight"
    And the Products response value at "resolution.priceCents" is "450"
    And the Products response value at "product.name" is "Cooked ham"

  Scenario: A price per kg only at another Shop does not count
    Given the Product "Cooked ham" cost 2500 cents per kg at the Shop "Corner Market" on 2026-11-08
    When I send GET "/api/resolve?barcode=2200123004505&format=ean_13&shop={shop:Butcher}" for Products
    Then the Products response value at "resolution.outcome" is "ask_weight"

  Scenario: A rule prefix with an item code nobody knows
    When I send GET "/api/resolve?barcode=2100999007504&format=ean_13&shop={shop:Butcher}" for Products
    Then the Products response value at "resolution.outcome" is "unknown_weighed_product"
    And the Products response value at "resolution.itemCode" is "00999"
    And the Products response value at "resolution.weightGrams" is "750"
    And the Products response value at "resolution.ruleId" is "{rule:Butcher/21}"
    And the Products response value at "product" is null

  Scenario: A zero value is invalid
    When I send GET "/api/resolve?barcode=2200123000002&format=ean_13&shop={shop:Butcher}" for Products
    Then the Products response value at "resolution.outcome" is "invalid"
    And the Products response value at "resolution.reason" is "zero_value"

  Scenario: A Shop Barcode resolves at its Shop
    When I send GET "/api/resolve?barcode=PRIVATE-77&format=code_128&shop={shop:Corner Market}" for Products
    Then the Products response value at "resolution.outcome" is "product"
    And the Products response value at "resolution.via" is "shop_barcode"
    And the Products response value at "resolution.productId" is "{product:Mutti passata}"

  Scenario: A Shop Barcode means nothing at another Shop
    When I send GET "/api/resolve?barcode=PRIVATE-77&format=code_128&shop={shop:Butcher}" for Products
    Then the Products response value at "resolution.outcome" is "unknown"

  Scenario: A global barcode resolves at a Shop and at home
    When I send GET "/api/resolve?barcode=8001234567897&format=ean_13&shop={shop:Butcher}" for Products
    Then the Products response value at "resolution.via" is "global"
    When I GET "/api/resolve?barcode=8001234567897&format=ean_13"
    Then the Products response value at "resolution.outcome" is "product"
    And the Products response value at "product.packSize" is "700"

  Scenario: At home the Weight Barcode Rules do not apply
    When I GET "/api/resolve?barcode=2100123007509&format=ean_13"
    Then the Products response value at "resolution.outcome" is "unknown"

  Scenario: A barcode nobody knows is unknown, with its canonical code
    When I GET "/api/resolve?barcode=5901234123457&format=ean_13"
    Then the Products response value at "resolution.outcome" is "unknown"
    And the Products response value at "resolution.code" is "05901234123457"

  Scenario: Unreadable and non-product scans pass through
    When I GET "/api/resolve?barcode=5901234123450&format=ean_13"
    Then the Products response value at "resolution.outcome" is "invalid"
    And the Products response value at "resolution.reason" is "check_digit"
    When I GET "/api/resolve?barcode=hello&format=qr_code"
    Then the Products response value at "resolution.outcome" is "not_product"
