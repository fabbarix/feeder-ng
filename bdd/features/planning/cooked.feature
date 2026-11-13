Feature: Cooked, Not cooked and Leftovers
  Mark as Cooked proposes the Leftover portions (Batches x Yield - portions needed), deducts
  Stock, records the actual Leftover with its Use-by and replans. Not cooked skips the meal.
  Leftovers past their Use-by are not discarded; they wait for an answer (ADR 0012).

  Background: Monday 2026-11-09 12:00 UTC. Monday's dinner is chicken (Yield 4, two eat, 400 g thighs + 250 g rice per Batch); Tuesday is served from its 2 extra portions
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 3 days ahead
    And the planning Recipes:
      | name    | yield | tags | needs                         |
      | pasta   | 2     |      | 100 g flour                   |
      | soup    | 2     |      | 120 g carrot                  |
      | curry   | 2     |      | 150 g rice                    |
      | chicken | 4     |      | 400 g chicken thighs, 250 g rice |
    And I am signed in as the User
    And the planner has finished
    And I pin the plan slot on 2026-11-09 as "chicken"
    And the planner has finished

  Scenario: Tuesday is planned as the chicken Leftover
    When I view the plan
    Then the plan slot on 2026-11-10 has the Recipe "chicken"
    And the plan slot on 2026-11-10 is served from the Leftover of 2026-11-09
    And the plan slot on 2026-11-10 has the why chip "leftover"

  Scenario: The Mark as Cooked sheet proposes the Leftover
    When I preview Cooking the slot on 2026-11-09
    Then the response status is 200
    And the plan JSON "batches" is "1"
    And the plan JSON "yield" is "4"
    And the plan JSON "portionsNeeded" is "2"
    And the plan JSON "proposedLeftover" is "2"
    And the plan JSON "leftoverUseBy" is "2026-11-12"
    And the plan JSON "maxLeftover" is "4"

  Scenario: Cooked deducts Stock, records the Leftover and keeps its dependant
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    When I mark the slot on 2026-11-09 as Cooked
    Then the response status is 200
    And the plan JSON "meal.state" is "cooked"
    And the plan JSON "leftover.portions" is "2"
    And the plan JSON "leftover.cookedOn" is "2026-11-09"
    And the plan JSON "leftover.useBy" is "2026-11-12"
    And planning Stock holds 600 g of "chicken thighs" in total
    And planning Stock holds 750 g of "rice" in total
    And the plan slot on 2026-11-10 is served from the Leftover of 2026-11-09

  Scenario: Short Stock warns, never blocks and floors at zero; a one-tap correction sets the total
    Given planning Stock holds 300 g of "chicken thighs"
    When I mark the slot on 2026-11-09 as Cooked
    Then the response status is 200
    And the plan JSON "warnings.0.message" is "Stock shows only 300 g chicken thighs, the recipe uses 400 g"
    And planning Stock holds 0 g of "chicken thighs" in total
    When I correct Stock to 250 g of "chicken thighs" from the warning
    Then planning Stock holds 250 g of "chicken thighs" in total

  Scenario: A smaller actual Leftover replans the meal that depended on it
    When I mark the slot on 2026-11-09 as Cooked with 1 Leftover portions
    Then the response status is 200
    And the plan JSON "leftover.portions" is "1"
    When I view the plan
    Then the plan slot on 2026-11-10 is cooked fresh
    And the plan slot on 2026-11-10 is not pinned

  Scenario: A Pinned dependant is unpinned and replanned when the Leftover shrinks
    Given I confirm the plan slot on 2026-11-10
    When I mark the slot on 2026-11-09 as Cooked with 0 Leftover portions
    And I view the plan
    Then the plan slot on 2026-11-10 is cooked fresh
    And the plan slot on 2026-11-10 is not pinned

  Scenario: A larger actual Leftover keeps its dependant and the extra stays pending
    When I mark the slot on 2026-11-09 as Cooked with 4 Leftover portions
    And I list the Leftovers
    Then the plan JSON "leftovers.0.portions" is "4"
    And the plan slot on 2026-11-10 is served from the Leftover of 2026-11-09

  Scenario: Leftover portions outside zero to Batches x Yield are refused and nothing changes
    When I mark the slot on 2026-11-09 as Cooked with 5 Leftover portions
    Then the response status is 422
    And the error code is "validation_failed"
    When I view the plan
    Then the plan slot on 2026-11-09 is planned

  Scenario: A meal cannot be marked Cooked twice
    Given Monday's dinner is marked Cooked
    When I mark the slot on 2026-11-09 as Cooked
    Then the response status is 409
    And the error code is "already_resolved"

  Scenario: Not cooked skips the meal, leaves Stock alone and replans dependants
    Given planning Stock holds 1000 g of "chicken thighs"
    When I mark the slot on 2026-11-09 as Not cooked
    Then the response status is 200
    And the plan JSON "state" is "skipped"
    And planning Stock holds 1000 g of "chicken thighs" in total
    When I list the Leftovers
    Then the plan has no Leftovers
    When I view the plan
    Then the plan slot on 2026-11-10 is cooked fresh

  Scenario: An unconfirmed meal shows in To confirm two hours after its slot time
    Given the household clock is 2026-11-09 20:59 UTC
    When I list the meals to confirm
    Then the plan has no meals to confirm
    When the household clock is 2026-11-09 21:00 UTC
    And I list the meals to confirm
    Then the plan JSON "slots.0.date" is "2026-11-09"
    When I mark the slot on 2026-11-09 as Cooked
    And I list the meals to confirm
    Then the plan has no meals to confirm

  Scenario: A Leftover past its Use-by is not discarded overnight and waits for an answer
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    And I mark the slot on 2026-11-09 as Cooked with 4 Leftover portions
    When the household clock is 2026-11-13 03:00 UTC
    And the scheduler runs its due jobs
    And I list the Leftovers
    Then the plan JSON "leftovers.0.portions" is "4"
    And the plan JSON "leftovers.0.toAnswer" is "true"
    And the Household has recorded no waste

  Scenario: A Leftover is still good on its Use-by date
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    And I mark the slot on 2026-11-09 as Cooked with 4 Leftover portions
    When the household clock is 2026-11-12 03:00 UTC
    And the scheduler runs its due jobs
    And I list the Leftovers
    Then the plan JSON "leftovers.0.portions" is "4"

  # B8 (QA round 2): the "leftovers for <day>" chip on the source meal must follow reality after a replan.
  Scenario: After a smaller Leftover no Planned Meal keeps a "leftovers for" chip for a day that no longer eats it
    When I mark the slot on 2026-11-09 as Cooked with 1 Leftover portions
    And I view the plan
    Then the plan slot on 2026-11-10 is cooked fresh
    And no "leftover_fits" why chip names a day that is not served from its meal

  # B10 (QA round 2): only meals whose date is today or earlier can be resolved.
  Scenario: A future Planned Meal cannot be marked Cooked
    When I mark the slot on 2026-11-10 as Cooked
    Then the response status is 409
    And the error code is "future_meal"
    When I view the plan
    Then the plan slot on 2026-11-10 is planned

  Scenario: A future Planned Meal cannot be marked Not cooked
    When I mark the slot on 2026-11-10 as Not cooked
    Then the response status is 409
    And the error code is "future_meal"

  Scenario: Today's dinner can be marked Cooked in the morning
    Given the household clock is 2026-11-09 07:00 UTC
    When I mark the slot on 2026-11-09 as Cooked
    Then the response status is 200

  Scenario: Tomorrow's Planned Meal can be marked Cooked once tomorrow comes
    Given the household clock is 2026-11-10 08:00 UTC
    And I mark the slot on 2026-11-09 as Cooked
    When I mark the slot on 2026-11-10 as Cooked
    Then the response status is 200

  # B13 (QA round 2): the Cooked response says where the Leftover went.
  Scenario: Cooked tells which later Planned Meal the Leftover is planned for
    When I mark the slot on 2026-11-09 as Cooked
    Then the response status is 200
    And the plan JSON "plannedFor" has 1 items
    And the plan JSON "plannedFor.0.date" is "2026-11-10"
    And the plan JSON "plannedFor.0.mealSlotName" is "Dinner"
    And the plan JSON "plannedFor.0.recipeName" is "chicken"
    And the plan JSON "leftover.portions" is "2"

  Scenario: A Leftover nothing is planned for is reported as kept
    When I mark the slot on 2026-11-09 as Cooked with 1 Leftover portions
    Then the response status is 200
    And the plan JSON "leftover.portions" is "1"
    And the plan JSON "plannedFor" has 0 items

  Scenario: Cooked with no Leftover reports nothing planned
    When I mark the slot on 2026-11-09 as Cooked with 0 Leftover portions
    Then the plan JSON "plannedFor" has 0 items

  # N1 (QA round 2): the meal served from a stored Leftover says which day it comes from.
  Scenario: After Cooked with a Leftover, the served meal reports the source date of the Leftover over the API
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    When I mark the slot on 2026-11-09 as Cooked
    And I view the plan from 2026-11-10 to 2026-11-10
    Then the plan JSON "slots.0.courses.0.meal.servedFromLeftover.date" is "2026-11-09"
    When I view the plan
    Then the plan slot on 2026-11-10 is served from the Leftover of 2026-11-09

  # N4 (QA round 2): Marking a meal Cooked or Not cooked cancels the Cook timers of that Planned Meal, however they stand.
  Scenario: Marking a meal as Cooked cancels its Cook timers, paused ones too, and leaves other meals' and free timers alone
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    And I start the timer "Rest the chicken" for 600 seconds on the meal of 2026-11-09
    And I start the timer "Simmer the rice" for 900 seconds on the meal of 2026-11-09
    And I pause the Cook timer "Simmer the rice"
    And I start the timer "Tuesday marinade" for 600 seconds on the meal of 2026-11-10
    And I start the free timer "Eggs" for 300 seconds
    When I mark the slot on 2026-11-09 as Cooked
    Then the response status is 200
    And the Cook timers are exactly "Eggs, Tuesday marinade"

  Scenario: Marking a meal as Not cooked cancels its Cook timers, paused ones too, and leaves other meals' and free timers alone
    Given I start the timer "Rest the chicken" for 600 seconds on the meal of 2026-11-09
    And I start the timer "Simmer the rice" for 900 seconds on the meal of 2026-11-09
    And I pause the Cook timer "Simmer the rice"
    And I start the timer "Tuesday marinade" for 600 seconds on the meal of 2026-11-10
    And I start the free timer "Eggs" for 300 seconds
    When I mark the slot on 2026-11-09 as Not cooked
    Then the response status is 200
    And the Cook timers are exactly "Eggs, Tuesday marinade"

  Scenario: A refused Mark as Cooked keeps the Cook timers
    Given I start the timer "Rest the chicken" for 600 seconds on the meal of 2026-11-09
    When I mark the slot on 2026-11-09 as Cooked with 5 Leftover portions
    Then the response status is 422
    And the Cook timers are exactly "Rest the chicken"

  # R11b (R10 review): the Cook preview of a meal served from a stored Leftover names the day it comes from too.
  Scenario: The Cook preview of a meal served from a stored Leftover reports the source date of the Leftover
    Given planning Stock holds 1000 g of "chicken thighs"
    And planning Stock holds 1000 g of "rice"
    When I mark the slot on 2026-11-09 as Cooked
    And the stored meal on 2026-11-10 has lost its Leftover source date
    And I preview Cooking the slot on 2026-11-10
    Then the response status is 200
    And the plan JSON "meal.servedFromLeftover.date" is "2026-11-09"
