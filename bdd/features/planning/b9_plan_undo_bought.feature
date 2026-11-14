Feature: A Bought Planned Meal does not move when another meal is swapped (beta.9, PC-01)
  A Swap or a Choose changes only what it breaks. A Planned Meal that a purchase from the Shopping List was bought for stays
  where it is, whatever another meal does, and the answer to the Swap does not list it as changed. Monday 2026-11-09
  12:00 UTC; Dinner is at 19:00 every day and the Planning Horizon is 3 days.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping Recipes:
      | name          | yield | needs                             |
      | roast chicken | 1     | 400 g chicken thighs, 100 g cream |
      | tomato pasta  | 1     | 320 g pasta                       |
      | lentil soup   | 1     | 200 g lentils                     |
      | fish pie      | 1     | 300 g cod                         |
    And the shopping catalogue has the Product "Chicken thighs 400 g" of "chicken thighs" in g with pack size 400 and barcode "5000000000012"

  Scenario: Meals I shopped for do not move when I swap another meal
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    When I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    Then the Dinner of 2026-11-10 is Bought for "chicken thighs"
    When I swap the Dinner of 2026-11-09 to "fish pie"
    Then the Dinner of 2026-11-10 is Bought for "chicken thighs"
    And the Dinner of 2026-11-10 is "roast chicken"
    And the Dinner of 2026-11-11 is "lentil soup"
