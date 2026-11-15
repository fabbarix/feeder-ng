@area-shopping-scan
Feature: The Price behind a priced fallback travels with the pack (beta.9, SSP-13, B9-23)
  A Line whose pack is the priced fallback (nothing bought yet) says which Price its estimate used, so the Line sheet can
  say "$4.50 a pack, 2 Nov, not bought here yet" without another read. A Product that was bought carries no Price on the
  pack. Monday 2026-11-09 12:00 UTC.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 1 days ahead
    And the shopping household has the Ingredient "chicken thighs" in g
    And the shopping Recipes:
      | name             | yield | needs                  |
      | chicken traybake | 2     | 400 g chicken thighs   |
    And the shopping dinners are pinned:
      | date       | recipe           | batches |
      | 2026-11-09 | chicken traybake | 1       |

  Scenario: A priced fallback pack says which Price it used
    Given the shopping catalogue has the Product "Chicken thighs 500 g" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    And "Chicken thighs 500 g" has a Price of 450 cents at "Coop"
    Then the pack of "chicken thighs" says it is priced at 450 cents on 2026-11-02 at "Coop"

  Scenario: A pack of a Product bought before carries no Price
    Given the shopping catalogue has the Product "Chicken thighs 500 g" of "chicken thighs" in g with pack size 500 and barcode "4000000000013"
    And the household last bought "Chicken thighs 500 g" at "Coop"
    And "Chicken thighs 500 g" has a Price of 450 cents at "Coop"
    Then the pack of "chicken thighs" says it has no Price of its own
