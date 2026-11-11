Feature: Shops
  Every User can see the Household's Shops, add one and save where it is (its Shop Location).
  Only the Admin renames or deletes a Shop.

  Background:
    Given a running Feeder

  Scenario: The Admin adds a Shop
    Given I am signed in as the Admin
    When I POST "/api/shops" with JSON:
      """
      {"name": "  Corner   Market "}
      """
    Then the response status is 201
    And the response JSON field "name" is "Corner Market"

  Scenario: A User adds a Shop standing in it, with its Shop Location
    Given I am signed in as the User
    When I send POST "/api/shops" for Products with JSON:
      """
      {"name": "Coop", "location": {"lat": 45.4642, "lon": 9.19}}
      """
    Then the response status is 201
    And the Products response value at "name" is "Coop"
    And the Products response value at "location.lat" is "45.4642"
    And the Products response value at "location.lon" is "9.19"

  Scenario: A Shop added without a location has none
    Given I am signed in as the User
    When I send POST "/api/shops" for Products with JSON:
      """
      {"name": "Mine"}
      """
    Then the response status is 201
    And the Products response value at "location" is null

  Scenario: A User saves the Shop Location of an existing Shop
    Given the Household shops at "Corner Market"
    And I am signed in as the User
    When I send PUT "/api/shops/{shop:Corner Market}/location" for Products with JSON:
      """
      {"lat": 51.5072, "lon": -0.1276}
      """
    Then the response status is 200
    And the Products response value at "name" is "Corner Market"
    And the Products response value at "location.lon" is "-0.1276"
    When I GET "/api/shops"
    Then the Products response value at "0.location.lat" is "51.5072"

  Scenario Outline: A Shop Location must be on the globe
    Given the Household shops at "Corner Market"
    And I am signed in as the User
    When I send PUT "/api/shops/{shop:Corner Market}/location" for Products with JSON:
      """
      <body>
      """
    Then the response status is 400
    And the error code is "invalid_shop"

    Examples:
      | body                      |
      | {"lat": 91, "lon": 0}     |
      | {"lat": 0, "lon": -180.5} |

  Scenario: A User cannot rename or delete a Shop
    Given the Household shops at "Corner Market"
    And I am signed in as the User
    When I send PATCH "/api/shops/{shop:Corner Market}" for Products with JSON:
      """
      {"name": "Renamed"}
      """
    Then the response status is 403
    When I send DELETE "/api/shops/{shop:Corner Market}" for Products
    Then the response status is 403

  Scenario: A User can list Shops, ordered by name
    Given the Household shops at "Zed Grocer"
    And the Household shops at "alpha Foods"
    And I am signed in as the User
    When I GET "/api/shops"
    Then the response status is 200
    And the Products response has 2 entries
    And the Products response value at "0.name" is "alpha Foods"
    And the Products response value at "1.name" is "Zed Grocer"

  Scenario: Signed-out visitors get nothing
    Given I am not signed in
    When I GET "/api/shops"
    Then the response status is 401

  Scenario Outline: Shop names are unique ignoring case and spacing
    Given the Household shops at "Corner Market"
    And I am signed in as the Admin
    When I POST "/api/shops" with JSON:
      """
      {"name": "<name>"}
      """
    Then the response status is 409
    And the error code is "name_taken"

    Examples:
      | name             |
      | corner market    |
      |   CORNER  MARKET |

  Scenario: A Shop needs a name
    Given I am signed in as the Admin
    When I POST "/api/shops" with JSON:
      """
      {"name": "   "}
      """
    Then the response status is 400
    And the error code is "invalid_shop"

  Scenario: The Admin renames a Shop; its id stays
    Given the Household shops at "Corner Market"
    And I am signed in as the Admin
    When I send PATCH "/api/shops/{shop:Corner Market}" for Products with JSON:
      """
      {"name": "Corner Shop"}
      """
    Then the response status is 200
    And the Products response value at "id" is "{shop:Corner Market}"
    And the Products response value at "name" is "Corner Shop"

  Scenario: Deleting a Shop removes its Shop Barcodes and Prices but keeps the Product
    Given an Ingredient "tomato passata" counted in g exists for Products
    And the Household shops at "Corner Market"
    And the Product "Mutti passata" of Ingredient "tomato passata" with pack size 700 exists
    And at the Shop "Corner Market" the code "PRIVATE-77" is the Product "Mutti passata"
    And the Product "Mutti passata" cost 159 cents at the Shop "Corner Market" on 2026-11-01
    And I am signed in as the Admin
    When I send DELETE "/api/shops/{shop:Corner Market}" for Products
    Then the response status is 204
    When I send GET "/api/products/{product:Mutti passata}" for Products
    Then the response status is 200
    And the Products response has 0 entries at "shopBarcodes"
    And the Products response has 0 entries at "latestPrices"
    And the Products response has 0 entries at "shops"
