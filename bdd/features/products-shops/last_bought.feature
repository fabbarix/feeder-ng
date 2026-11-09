Feature: The Product last bought for an Ingredient
  The planner and the Shopping List suggest packs of the Product last bought for an
  Ingredient, at the chosen Shop if known. A Price alone is not a purchase.

  Background:
    Given a running Feeder
    And an Ingredient "tomato passata" counted in g exists for Products
    And an Ingredient "rice" counted in g exists for Products
    And the Household shops at "Corner Market"
    And the Household shops at "Big Mart"
    And the Product "Passata 400 g" of Ingredient "tomato passata" with pack size 400 exists
    And the Product "Passata 700 g" of Ingredient "tomato passata" with pack size 700 exists
    And the Product "Rice 1 kg" of Ingredient "rice" with pack size 1000 exists
    And I am signed in as the User

  Scenario: Nothing bought yet means no answer, even if a Price is known
    Given the Product "Passata 400 g" cost 100 cents at the Shop "Corner Market" on 2026-11-01
    When I send GET "/api/products/last-bought?ingredient={ingredient:tomato passata}" for Products
    Then the response status is 404

  Scenario: The most recent purchase anywhere
    Given the Product "Passata 400 g" was bought at the Shop "Corner Market" on 2026-10-20
    And the Product "Passata 700 g" was bought at the Shop "Big Mart" on 2026-11-02
    When I send GET "/api/products/last-bought?ingredient={ingredient:tomato passata}" for Products
    Then the response status is 200
    And the Products response value at "name" is "Passata 700 g"
    And the Products response value at "packSize" is "700"

  Scenario: At a Shop the Product bought there wins, even if another is newer elsewhere
    Given the Product "Passata 400 g" was bought at the Shop "Corner Market" on 2026-10-20
    And the Product "Passata 700 g" was bought at the Shop "Big Mart" on 2026-11-02
    When I send GET "/api/products/last-bought?ingredient={ingredient:tomato passata}&shop={shop:Corner Market}" for Products
    Then the Products response value at "name" is "Passata 400 g"

  Scenario: A Shop where nothing was bought falls back to anywhere
    Given the Household shops at "Deli"
    And the Product "Passata 700 g" was bought at the Shop "Big Mart" on 2026-11-02
    When I send GET "/api/products/last-bought?ingredient={ingredient:tomato passata}&shop={shop:Deli}" for Products
    Then the Products response value at "name" is "Passata 700 g"

  Scenario: Bought at home counts too
    Given the Product "Passata 400 g" was bought at home on 2026-11-05
    When I send GET "/api/products/last-bought?ingredient={ingredient:tomato passata}" for Products
    Then the Products response value at "name" is "Passata 400 g"

  Scenario: Two on the same day: the later purchase wins
    Given the Product "Passata 700 g" was bought at the Shop "Corner Market" on 2026-11-02
    And the Product "Passata 400 g" was bought at the Shop "Corner Market" on 2026-11-02
    When I send GET "/api/products/last-bought?ingredient={ingredient:tomato passata}" for Products
    Then the Products response value at "name" is "Passata 400 g"

  Scenario: Several Ingredients at once; those never bought are left out
    Given the Product "Passata 700 g" was bought at the Shop "Big Mart" on 2026-11-02
    When I send GET "/api/products/last-bought?ingredients={ingredient:tomato passata},{ingredient:rice}" for Products
    Then the response status is 200
    And the Products response value at "{ingredient:tomato passata}.name" is "Passata 700 g"
    And the Products response has no value at "{ingredient:rice}"

  Scenario: Undoing a purchase takes it back
    Given the Product "Passata 700 g" was bought at the Shop "Big Mart" on 2026-11-02
    When I send DELETE "/api/purchases/{purchase:Passata 700 g/Big Mart/2026-11-02}" for Products
    Then the response status is 204
    When I send GET "/api/products/last-bought?ingredient={ingredient:tomato passata}" for Products
    Then the response status is 404

  Scenario: A purchase needs a real Product and date
    When I send POST "/api/purchases" for Products with JSON:
      """
      {"productId": 99999, "date": "2026-11-02"}
      """
    Then the response status is 404
    When I send POST "/api/purchases" for Products with JSON:
      """
      {"productId": {product:Rice 1 kg}, "date": "yesterday"}
      """
    Then the response status is 400
    And the error code is "invalid_date"
