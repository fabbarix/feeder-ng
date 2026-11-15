@area-products-shops
Feature: Prices by Shop
  A Shop's page lists the latest Price of each Product recorded there, read in one request by Shop. It needs no Shop
  Barcode: a Price is recorded when a receipt is read or when a Price is added on a Product (SET-02).

  Background:
    Given a running Feeder
    And an Ingredient "butter" counted in g exists for Products
    And an Ingredient "jam" counted in g exists for Products
    And the Household shops at "Coop"
    And the Household shops at "Aldi"
    And the Product "Butter" of Ingredient "butter" with pack size 250 exists
    And the Product "Apple jam" of Ingredient "jam" with pack size 300 exists
    And I am signed in as the User

  Scenario: A Shop lists the Prices recorded there even when it has no Shop Barcodes
    Given the Product "Butter" cost 350 cents at the Shop "Coop" on 2026-10-01
    And the Product "Butter" cost 374 cents at the Shop "Coop" on 2026-11-14
    And the Product "Apple jam" cost 249 cents at the Shop "Coop" on 2026-11-14
    And the Product "Butter" cost 100 cents at the Shop "Aldi" on 2026-11-15
    When I send GET "/api/shops/{shop:Coop}/prices" for Products
    Then the response status is 200
    And the Products response has 2 entries
    And the Products response value at "0.product.name" is "Apple jam"
    And the Products response value at "1.product.name" is "Butter"
    And the Products response value at "1.price.priceCents" is "374"
    And the Products response value at "1.price.date" is "2026-11-14"
    And the Products response value at "1.price.pricePerKgCents" is "1496"

  Scenario: An archived Product's Price is left out
    Given the Product "Butter" cost 374 cents at the Shop "Coop" on 2026-11-14
    And the Product "Apple jam" cost 249 cents at the Shop "Coop" on 2026-11-14
    And the Product "Apple jam" is archived
    When I send GET "/api/shops/{shop:Coop}/prices" for Products
    Then the Products response has 1 entries
    And the Products response value at "0.product.name" is "Butter"

  Scenario: A Shop with no Prices says so and says how one is recorded
    Given the Product "Butter" cost 374 cents at the Shop "Aldi" on 2026-11-14
    When I send GET "/api/shops/{shop:Coop}/prices" for Products
    Then the response status is 200
    And the Products response has 0 entries

  Scenario: An unknown Shop has no Prices
    When I GET "/api/shops/99999/prices"
    Then the response status is 404
