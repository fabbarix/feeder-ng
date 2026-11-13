@b5-bo
Feature: Plan stability: Bought Planned Meals (beta.5, plan 2.4, ADR 0013)
  A Planned Meal is Bought once a purchase from the Shopping List (a Scan in Shop mode that matched a line, or a Tick by
  hand that adds a Lot) covered part of one of its required Ingredient lines. Automatic replans leave a Bought Planned
  Meal where it is, whatever the trigger; only Regenerate, Swap or choosing a Recipe by hand changes it. Undo of the Scan,
  unticking or deleting the Lot makes it not Bought again. Monday 2026-11-09 12:00 UTC; Dinner is at 19:00 every day and
  the Planning Horizon is 3 days (Mon 9, Tue 10, Wed 11). Anna eats alone and every Recipe serves one, so a Planned Meal of
  one Batch needs exactly the amounts on its Recipe and leaves no Leftover.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has a Dinner at 19:00 every day
    And the shopping household plans 3 days ahead
    And the shopping Recipes:
      | name          | yield | needs                             |
      | roast chicken | 1     | 400 g chicken thighs, 100 g cream |
      | chicken curry | 1     | 400 g chicken thighs, 50 g rice   |
      | tomato pasta  | 1     | 320 g pasta                       |
      | lentil soup   | 1     | 200 g lentils                     |
      | fish pie      | 1     | 300 g cod                         |
    And the shopping catalogue has the Product "Chicken thighs 400 g" of "chicken thighs" in g with pack size 400 and barcode "5000000000012"
    And the shopping catalogue has the Product "Chicken thighs 800 g" of "chicken thighs" in g with pack size 800 and barcode "5000000000029"

  # --- What makes a Planned Meal Bought ---

  Scenario: Scanning chicken thighs makes Tuesday's roast chicken Bought
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    When I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" was applied
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"
    And the Dinner of 2026-11-09 is not Bought
    And the Dinner of 2026-11-11 is not Bought

  Scenario: A partial Scan makes only the earliest Planned Meal Bought
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | chicken curry | 1       |
    When I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    Then the Dinner of 2026-11-10 is Bought for "chicken thighs"
    And the Dinner of 2026-11-11 is not Bought

  Scenario: A second pack makes the next Planned Meal Bought
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | chicken curry | 1       |
    When I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0002"
    Then the Dinner of 2026-11-10 is Bought for "chicken thighs"
    And the Dinner of 2026-11-11 is Bought for "chicken thighs"

  Scenario: A Tick by hand that adds a Lot makes the Planned Meal Bought
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    When I tick "chicken thighs" on the Shopping List by hand with 400 g
    Then the Dinner of 2026-11-10 is Bought for "chicken thighs"

  Scenario: A Tick by hand with nothing bought buys nothing
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    When I tick "chicken thighs" on the Shopping List by hand with 0 g
    Then the Dinner of 2026-11-10 is not Bought

  Scenario: Not needed is not a purchase
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    When I view the Shopping List
    And I mark "chicken thighs" as Not needed on the Shopping List
    Then the Dinner of 2026-11-10 is not Bought

  Scenario: A Scan of an Ingredient no Planned Meal needs buys for nobody
    Given the planned dinners:
      | date       | recipe       | batches |
      | 2026-11-09 | fish pie      | 1       |
      | 2026-11-10 | tomato pasta  | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    When I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    Then the Dinner of 2026-11-10 is not Bought

  Scenario: A Planned Meal outside the list range is not Bought by a purchase
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | fish pie      | 1       |
      | 2026-11-10 | tomato pasta  | 1       |
      | 2026-11-11 | roast chicken | 1       |
    When I scan the barcode "5000000000012" at "Coop" as scan "scan-0001" for the range ending 2026-11-10
    Then the Dinner of 2026-11-11 is not Bought

  Scenario: A Planned Meal whose slot has passed absorbs Stock first and is not Bought
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | roast chicken | 1       |
      | 2026-11-10 | chicken curry | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And the shopping clock moves on 8 hours
    When I scan the barcode "5000000000029" at "Coop" as scan "scan-0001"
    Then the Dinner of 2026-11-09 is not Bought
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"

  # --- What undoes it ---

  Scenario: Undo of the Scan makes the Planned Meal no longer Bought
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I undo scan "scan-0001"
    Then the Dinner of 2026-11-10 is not Bought

  Scenario: Undo of one of two Scans keeps the other's Planned Meal Bought
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | chicken curry | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0002"
    When I undo scan "scan-0002"
    Then the Dinner of 2026-11-10 is Bought for "chicken thighs"
    And the Dinner of 2026-11-11 is not Bought

  Scenario: Unticking a Tick by hand makes the Planned Meal no longer Bought
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I tick "chicken thighs" on the Shopping List by hand with 400 g
    When I untick "chicken thighs" on the Shopping List
    Then the Dinner of 2026-11-10 is not Bought

  # --- Automatic replans leave a Bought Planned Meal in place ---

  Scenario: Archiving a Recipe leaves a Bought Planned Meal in place and says so
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I archive the shopping Recipe "roast chicken"
    And I archive the shopping Recipe "tomato pasta"
    And the shopping planner has finished
    Then the Dinner of 2026-11-10 is "roast chicken"
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"
    And the Dinner of 2026-11-10 has the warning "archived"
    And the Dinner of 2026-11-09 is not "tomato pasta"

  Scenario: A Tag rename that moves a Slot Rule leaves a Bought Planned Meal in place
    Given the shopping Recipe "roast chicken" carries the Tag "Roast"
    And a Slot Rule names the Tag "Roast" for the Meal Slot "Dinner" on Tuesday in the Course "Main"
    And the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I rename the Tag "Roast" to "Sunday roast"
    And the shopping planner has finished
    Then the Dinner of 2026-11-10 is "roast chicken"
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"

  Scenario: A Slot Rule the Planned Meal does not satisfy does not replace a Bought one
    Given the shopping Recipe "fish pie" carries the Tag "Fish"
    And the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I add a Slot Rule for the shopping Dinner on 2026-11-10 with the Tag "Fish"
    And the shopping planner has finished
    Then the Dinner of 2026-11-10 is "roast chicken"
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"

  Scenario: A Stock-take leaves a Bought Planned Meal in place
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I scan the barcode "5000000000012" at home and choose "set_total" with total 100 as scan "take-0001"
    And the shopping planner has finished
    Then the Dinner of 2026-11-10 is "roast chicken"
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"

  # With the only Recipe the three Dinners are roast chicken, the last two relaxed picks (Cool-down). One 800 g pack is
  # bought for the first two. A new Recipe is a strict candidate: the third Dinner (not Bought) changes to it; Tuesday's
  # relaxed pick (Bought) stays.
  Scenario: Adding Recipes does not replace a Bought relaxed pick
    Given every shopping Recipe except "roast chicken" is archived
    And the shopping planner has finished
    And I scan the barcode "5000000000029" at "Coop" as scan "scan-0001"
    When I unarchive the shopping Recipe "lentil soup"
    And the shopping planner has finished
    Then the Dinner of 2026-11-09 is "roast chicken"
    And the Dinner of 2026-11-09 is Bought for "chicken thighs"
    And the Dinner of 2026-11-10 is "roast chicken"
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"
    And the Dinner of 2026-11-11 is "lentil soup"

  # --- Only Regenerate, Swap or choosing a Recipe changes it ---

  Scenario: Regenerate names Bought Planned Meals and replaces them
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I ask what Regenerate would replace
    Then Regenerate would replace 3 Planned Meals
    And Regenerate would name 1 Bought Planned Meal
    And Regenerate would name the Dinner of 2026-11-10 as Bought with "chicken thighs"
    And the Dinner of 2026-11-10 is "roast chicken"
    When I archive the shopping Recipe "roast chicken"
    And the shopping planner has finished
    And I regenerate the plan
    Then the Dinner of 2026-11-10 is not "roast chicken"
    And the Dinner of 2026-11-10 is not Bought
    And the shopping Stock total of "chicken thighs" is 400 g

  Scenario: Regenerate's dry run changes nothing
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I ask what Regenerate would replace
    Then the Dinner of 2026-11-10 is "roast chicken"
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"

  Scenario: Swap replaces a Bought Planned Meal and the Ingredients stay in Stock
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I swap the Dinner of 2026-11-10 to "fish pie"
    Then the Dinner of 2026-11-10 is "fish pie"
    And the Dinner of 2026-11-10 is not Bought
    And the shopping Stock total of "chicken thighs" is 400 g

  Scenario: A Bought Planned Meal that is also Pinned stays Bought when Regenerate leaves it alone
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | lentil soup   | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I pin the Dinner of 2026-11-10
    And I ask what Regenerate would replace
    Then Regenerate would name 0 Bought Planned Meals
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"

  Scenario: A Recipe that loses the Course keeps a Bought Planned Meal and warns, and loses the unbought ones
    Given the planned dinners:
      | date       | recipe        | batches |
      | 2026-11-09 | tomato pasta  | 1       |
      | 2026-11-10 | roast chicken | 1       |
      | 2026-11-11 | roast chicken | 1       |
    And I scan the barcode "5000000000012" at "Coop" as scan "scan-0001"
    When I take the main Course off the shopping Recipe "roast chicken"
    Then the Dinner of 2026-11-10 is "roast chicken"
    And the Dinner of 2026-11-10 is Bought for "chicken thighs"
    And the Dinner of 2026-11-10 has the warning "course_lost"
    And the Dinner of 2026-11-11 is not "roast chicken"
