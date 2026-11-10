Feature: Unknown barcodes
  The "what is this?" sheet creates the Product (and a Shop Barcode when it is Shop-only) and then proceeds as for
  a resolved barcode. A weighed code with an unknown item code asks only for the Ingredient and the Product name.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"

  Scenario: A new global barcode creates a Product that resolves everywhere
    Given the barcode "5012345678900" is unknown at "Coop"
    When I save the unknown barcode "5012345678900" at "Coop" as scan "scan-0001" with the form:
      | ingredient  | tinned tomatoes      |
      | baseUnit    | g                    |
      | packSize    | 400                  |
      | productName | Tinned tomatoes 400 g |
      | scope       | global               |
    Then scan "scan-0001" was applied
    And scan "scan-0001" created the Product "Tinned tomatoes 400 g"
    And scan "scan-0001" added 400 g of "tinned tomatoes"
    And the barcode "5012345678900" resolves to "Tinned tomatoes 400 g" at "Coop"
    And the barcode "5012345678900" resolves to "Tinned tomatoes 400 g" at home
    And "Tinned tomatoes 400 g" is sold at "Coop"

  Scenario: A Shop-only barcode is valid only in that Shop
    When I save the unknown barcode "5012345678900" at "Coop" as scan "scan-0001" with the form:
      | ingredient  | tinned tomatoes       |
      | baseUnit    | g                     |
      | packSize    | 400                   |
      | productName | Tinned tomatoes 400 g |
      | scope       | shop                  |
    Then scan "scan-0001" was applied
    And the barcode "5012345678900" resolves to "Tinned tomatoes 400 g" at "Coop"
    And the barcode "5012345678900" is unknown at home

  Scenario: An existing Ingredient is reused
    Given the shopping household has the Ingredient "tinned tomatoes" in g
    When I save the unknown barcode "5012345678900" at "Coop" as scan "scan-0001" with the form:
      | ingredient  | tinned tomatoes       |
      | baseUnit    | g                     |
      | packSize    | 400                   |
      | productName | Tinned tomatoes 400 g |
      | scope       | global                |
    Then scan "scan-0001" was applied
    And there is exactly 1 Ingredient named "tinned tomatoes"

  Scenario: A weighed code with an unknown item code asks only for the Ingredient and the Product name
    Given the shopping household has the Ingredient "carrots" in g
    And the Shop "Coop" has a weight rule with prefix "21" reading a weight in grams
    When I name the unknown weighed code "2100009005001" at "Coop" as scan "scan-0001" with Ingredient "carrots" and Product name "Loose carrots"
    Then scan "scan-0001" was applied
    And scan "scan-0001" added 500 g of "carrots"
    When I scan the barcode "2100009005001" at "Coop" as scan "scan-0002"
    Then scan "scan-0002" added 500 g of "carrots"

  Scenario: A form without a Product name is rejected and creates nothing
    When I save the unknown barcode "5012345678900" at "Coop" as scan "scan-0001" with the form:
      | ingredient  | tinned tomatoes |
      | baseUnit    | g               |
      | packSize    | 400             |
      | productName |                 |
      | scope       | global          |
    Then the response status is 422
    And scan "scan-0001" was rejected with "validation_failed"
    And the barcode "5012345678900" is unknown at "Coop"
    And the shopping Stock total of "tinned tomatoes" is 0 g
