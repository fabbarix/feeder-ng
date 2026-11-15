@area-products-shops
Feature: The Shops list counts each Shop's Prices
  Every Shop of the list carries `priceCount`, the number of Products with a Price recorded there, so the Shops list shows
  "12 Prices · Location saved" in one request (SET-14b).

  Background:
    Given a running Feeder
    And an Ingredient "butter" counted in g exists for Products
    And the Household shops at "Coop"
    And the Household shops at "Aldi"
    And the Product "Butter" of Ingredient "butter" with pack size 250 exists
    And the Product "Apple jam" of Ingredient "butter" with pack size 300 exists
    And I am signed in as the User

  Scenario: A Shop counts the Products with a Price once, however many Prices each has
    Given the Product "Butter" cost 350 cents at the Shop "Coop" on 2026-10-01
    And the Product "Butter" cost 374 cents at the Shop "Coop" on 2026-11-14
    And the Product "Apple jam" cost 249 cents at the Shop "Coop" on 2026-11-14
    When I send GET "/api/shops" for Products
    Then the response status is 200
    And the Products response value at "0.name" is "Aldi"
    And the Products response value at "0.priceCount" is "0"
    And the Products response value at "1.name" is "Coop"
    And the Products response value at "1.priceCount" is "2"

  Scenario: A Shop with no Prices counts none
    When I send GET "/api/shops" for Products
    Then the Products response value at "1.priceCount" is "0"
