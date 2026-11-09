Feature: Prices
  A Price is what a Product cost at a Shop on a date, in the minor unit of the Household's
  currency. The latest one prefills the next scan.

  Background:
    Given a running Feeder
    And an Ingredient "tomato passata" counted in g exists for Products
    And an Ingredient "milk" counted in ml exists for Products
    And the Household shops at "Corner Market"
    And the Household shops at "Big Mart"
    And the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    And I am signed in as the User

  Scenario: Record a Price; the price per kg is derived from the pack size
    When I send PUT "/api/products/{product:Mutti passata}/prices" for Products with JSON:
      """
      {"shopId": {shop:Corner Market}, "date": "2026-11-05", "priceCents": 159}
      """
    Then the response status is 200
    And the Products response value at "priceCents" is "159"
    And the Products response value at "pricePerKgCents" is "227"
    And the Products response value at "pricePerKgDerived" is "true"

  Scenario: Recording a Price records the Product as sold at that Shop
    When I send PUT "/api/products/{product:Mutti passata}/prices" for Products with JSON:
      """
      {"shopId": {shop:Corner Market}, "date": "2026-11-05", "priceCents": 159}
      """
    And I send GET "/api/products/{product:Mutti passata}" for Products
    Then the Products response value at "shops.0.name" is "Corner Market"
    And the Products response value at "latestPrices.0.priceCents" is "159"

  Scenario: The latest Price at the Shop prefills the next scan
    Given the Product "Mutti passata" cost 150 cents at the Shop "Corner Market" on 2026-10-20
    And the Product "Mutti passata" cost 165 cents at the Shop "Corner Market" on 2026-11-02
    And the Product "Mutti passata" cost 139 cents at the Shop "Big Mart" on 2026-11-08
    When I send GET "/api/products/{product:Mutti passata}/prices/latest?shop={shop:Corner Market}" for Products
    Then the Products response value at "priceCents" is "165"
    When I send GET "/api/products/{product:Mutti passata}/prices/latest" for Products
    Then the Products response value at "priceCents" is "139"

  Scenario: A Shop with no Price falls back to the latest at any Shop
    Given the Household shops at "Deli"
    And the Product "Mutti passata" cost 165 cents at the Shop "Corner Market" on 2026-11-02
    When I send GET "/api/products/{product:Mutti passata}/prices/latest?shop={shop:Deli}" for Products
    Then the Products response value at "shopId" is "{shop:Corner Market}"

  Scenario: No Price at all is null
    When I send GET "/api/products/{product:Mutti passata}/prices/latest" for Products
    Then the response status is 200
    And the Products response is JSON null

  Scenario: Recording on the same day again replaces the Price
    Given the Product "Mutti passata" cost 150 cents at the Shop "Corner Market" on 2026-11-05
    When I send PUT "/api/products/{product:Mutti passata}/prices" for Products with JSON:
      """
      {"shopId": {shop:Corner Market}, "date": "2026-11-05", "priceCents": 169}
      """
    And I send GET "/api/products/{product:Mutti passata}/prices" for Products
    Then the Products response has 1 entries
    And the Products response value at "0.priceCents" is "169"

  Scenario: History is newest first
    Given the Product "Mutti passata" cost 150 cents at the Shop "Corner Market" on 2026-10-20
    And the Product "Mutti passata" cost 165 cents at the Shop "Corner Market" on 2026-11-02
    When I send GET "/api/products/{product:Mutti passata}/prices?shop={shop:Corner Market}" for Products
    Then the Products response value at "0.date" is "2026-11-02"
    And the Products response value at "1.date" is "2026-10-20"

  Scenario: A weighed Product keeps an explicit price per kg
    Given an Ingredient "ham" counted in g exists for Products
    And the Product "Ham" of Ingredient "ham" with pack size 1000 exists
    When I send PUT "/api/products/{product:Ham}/prices" for Products with JSON:
      """
      {"shopId": {shop:Corner Market}, "date": "2026-11-05", "pricePerKgCents": 1800}
      """
    Then the response status is 200
    And the Products response value at "pricePerKgCents" is "1800"
    And the Products response value at "pricePerKgDerived" is "false"
    And the Products response value at "priceCents" is null

  Scenario: A millilitre Product has no price per kg
    Given the Product "Whole milk" of Ingredient "milk" with pack size 1000 exists
    When I send PUT "/api/products/{product:Whole milk}/prices" for Products with JSON:
      """
      {"shopId": {shop:Corner Market}, "date": "2026-11-05", "priceCents": 120}
      """
    Then the response status is 200
    And the Products response value at "pricePerKgCents" is null

  Scenario Outline: Invalid Prices are refused
    When I send PUT "/api/products/{product:Mutti passata}/prices" for Products with JSON:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "<code>"

    Examples:
      | body                                                                  | code          |
      | {"shopId": {shop:Corner Market}, "date": "2026-11-05"}                | invalid_price |
      | {"shopId": {shop:Corner Market}, "date": "2026-11-05", "priceCents": 0}  | invalid_price |
      | {"shopId": {shop:Corner Market}, "date": "2026-11-05", "priceCents": -5} | invalid_price |
      | {"shopId": {shop:Corner Market}, "date": "05/11/2026", "priceCents": 5}  | invalid_date  |
      | {"shopId": {shop:Corner Market}, "date": "2026-02-30", "priceCents": 5}  | invalid_date  |

  Scenario: An unknown Shop is not found
    When I send PUT "/api/products/{product:Mutti passata}/prices" for Products with JSON:
      """
      {"shopId": 99999, "date": "2026-11-05", "priceCents": 5}
      """
    Then the response status is 404

  Scenario: Delete a Price
    Given the Product "Mutti passata" cost 150 cents at the Shop "Corner Market" on 2026-11-05
    When I send DELETE "/api/prices/{price:Mutti passata/Corner Market/2026-11-05}" for Products
    Then the response status is 204
    When I send GET "/api/products/{product:Mutti passata}/prices" for Products
    Then the Products response has 0 entries
