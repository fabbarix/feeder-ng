Feature: Shopping List estimate before a first purchase
  With no purchase, a Line's pack suggestion and estimate use the Ingredient's priced Product at the selected Shop,
  else at any Shop: the most recent Price (decision SSP 5, SSP-13). Monday 2026-11-09 12:00 UTC.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has a Shop "Aldi"
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping household has the Ingredient "chicken thighs" in g with a Shelf Life of 4 days
    And the shopping Recipes:
      | name             | yield | needs                             |
      | chicken traybake | 2     | 400 g chicken thighs, 200 g rice  |
      | carrot soup      | 2     | 300 g carrots                     |
    And the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 2       |
      | 2026-11-10 | carrot soup      | 1       |
      | 2026-11-11 | chicken traybake | 1       |

  Scenario: A Line is estimated from a Price before the first purchase
    Given the shopping catalogue has the Product "Chicken thighs 500 g" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    And "Chicken thighs 500 g" has a Price of 450 cents at "Coop"
    When I view the Shopping List at "Coop"
    Then the Shopping List suggests 3 × "Chicken thighs 500 g" for "chicken thighs"
    And the line "chicken thighs" has an estimated cost of 1350 cents
    And the pack for "chicken thighs" is not bought yet
    And the Shopping List estimates 1350 cents
    And the Shopping List has 2 lines with no price

  Scenario: The priced Product at the selected Shop is used before a Price elsewhere
    Given the shopping catalogue has the Product "Thighs at Coop" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    And the shopping catalogue has the Product "Thighs at Aldi" of "chicken thighs" in g with pack size 1000 and barcode "4000000000020"
    And "Thighs at Coop" has a Price of 450 cents at "Coop"
    And "Thighs at Aldi" has a Price of 700 cents at "Aldi"
    When I view the Shopping List at "Coop"
    Then the Shopping List suggests 3 × "Thighs at Coop" for "chicken thighs"
    When I view the Shopping List at "Aldi"
    Then the Shopping List suggests 2 × "Thighs at Aldi" for "chicken thighs"

  Scenario: Without a purchase and a Price at the selected Shop, a Price at any Shop is used
    Given the shopping catalogue has the Product "Thighs at Aldi" of "chicken thighs" in g with pack size 500 and barcode "4000000000020"
    And "Thighs at Aldi" has a Price of 400 cents at "Aldi"
    When I view the Shopping List at "Coop"
    Then the line "chicken thighs" has an estimated cost of 1200 cents

  Scenario: A Product bought before is suggested ahead of a priced one
    Given the shopping catalogue has the Product "Bought thighs" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    And the shopping catalogue has the Product "Cheaper thighs" of "chicken thighs" in g with pack size 400 and barcode "4000000000020"
    And the household last bought "Bought thighs" at "Coop"
    And "Bought thighs" has a Price of 450 cents at "Coop"
    And "Cheaper thighs" has a Price of 100 cents at "Coop"
    When I view the Shopping List at "Coop"
    Then the Shopping List suggests 3 × "Bought thighs" for "chicken thighs"
    And the pack for "chicken thighs" is bought

  Scenario: A Line with no priced Product has no pack
    When I view the Shopping List at "Coop"
    Then the Shopping List shows no pack for "chicken thighs"
    And the Shopping List has 3 lines with no price

  Scenario: Change the Price from a Line
    Given the shopping catalogue has the Product "Chicken thighs 500 g" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    And "Chicken thighs 500 g" has a Price of 450 cents at "Coop"
    When I view the Shopping List at "Coop"
    Then the line "chicken thighs" has an estimated cost of 1350 cents
    Given "Chicken thighs 500 g" has a Price of 500 cents at "Coop"
    When I view the Shopping List at "Coop"
    Then the line "chicken thighs" has an estimated cost of 1500 cents
