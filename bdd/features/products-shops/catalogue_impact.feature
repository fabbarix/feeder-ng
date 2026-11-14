Feature: Catalogue impact reads
  Delete Shop and Delete Ingredient confirm with what goes (SAFE-02). The impact reads count it without changing
  anything.

  Background:
    Given a running Feeder
    And an Ingredient "tomato passata" counted in g exists for Products
    And the Household shops at "Coop"
    And the Household shops at "Aldi"
    And the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    And the Shop "Coop" has a weight rule with prefix "21", item digits 3-7, value digits 8-12, unit "g" and 0 decimal places
    And at the Shop "Coop" the code "COOP-PASSATA" is the Product "Mutti passata"
    And the Product "Mutti passata" cost 349 cents at the Shop "Coop" on 2026-11-14
    And the Product "Mutti passata" cost 329 cents at the Shop "Coop" on 2026-11-10
    And I am signed in as the Admin

  Scenario: Delete Shop counts its Shop Barcodes, Weight Barcode Rules and Prices
    When I send GET "/api/shops/{shop:Coop}/impact" for Products
    Then the response status is 200
    And the Products response value at "shopBarcodes" is "1"
    And the Products response value at "weightBarcodeRules" is "1"
    And the Products response value at "prices" is "2"

  Scenario: A Shop with nothing recorded has an empty impact
    When I send GET "/api/shops/{shop:Aldi}/impact" for Products
    Then the Products response value at "shopBarcodes" is "0"
    And the Products response value at "weightBarcodeRules" is "0"
    And the Products response value at "prices" is "0"

  Scenario: The impact read changes nothing
    When I send GET "/api/shops/{shop:Coop}/impact" for Products
    And I send GET "/api/shops/{shop:Coop}/prices" for Products
    Then the Products response has 1 entries

  Scenario: An unknown Shop has no impact
    When I GET "/api/shops/99999/impact"
    Then the response status is 404

  Scenario: Delete Ingredient counts what refers to the Ingredient
    When I send GET "/api/ingredients/{ingredient:tomato passata}/impact" for Products
    Then the response status is 200
    And the Products response value at "references.products" is "1"
    And the Products response value at "total" is "1"
