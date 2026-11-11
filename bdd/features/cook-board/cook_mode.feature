Feature: Cook Mode
  Cook Mode opens for a Planned Meal or for a Recipe with a chosen Batch count.
  Steps come one at a time with their uses scaled to the Batches; Advance Steps
  are listed above as done or with a warning; a Passive Step offers a timer.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the kitchen knows the Ingredient "onion" in piece
    And the kitchen has the Recipe "Chicken stew" yielding 4 with these Steps:
      """
      [
        {"text": "Marinate the chicken", "kind": "advance", "leadTimeMinutes": 240},
        {"text": "Chop the onions", "kind": "active", "durationMinutes": 10, "uses": [{"ingredientId": <id:onion>, "quantity": 2, "unit": "piece"}]},
        {"text": "Simmer the stew", "kind": "passive", "durationMinutes": 45},
        {"text": "Plate up", "kind": "active", "durationMinutes": 5, "after": [2]}
      ]
      """

  Scenario: Cook Mode for a Recipe scales the uses to the Batches
    When I open Cook Mode for the Recipe "Chicken stew" with 2 Batches
    Then the response status is 200
    And the response JSON field "batches" is "2"
    And Cook Mode shows 3 Steps to cook and 1 Advance Step
    And Cook Mode shows the cooking Step 1 as "Chop the onions" of 3
    And the cooking Step 1 uses 4 piece of "onion"

  Scenario: Fractional Batches scale the uses too
    When I open Cook Mode for the Recipe "Chicken stew" with 1.5 Batches
    Then the cooking Step 1 uses 3 piece of "onion"

  Scenario: Batches must be a number above zero
    When I open Cook Mode for the Recipe "Chicken stew" with 0 Batches
    Then the response status is 422
    And the error code is "validation_failed"
    When I GET "/api/cook/recipes/999999"
    Then the response status is 404
    And the error code is "not_found"

  Scenario: Only a Passive Step offers a timer
    When I open Cook Mode for the Recipe "Chicken stew" with 1 Batch
    Then the cooking Step 1 offers no timer
    And the cooking Step 2 offers a timer of 2700 seconds
    And the cooking Step 3 offers no timer

  Scenario: A Step lists the Steps it waits for, so Cook Mode can hold Next until their timers end
    When I open Cook Mode for the Recipe "Chicken stew" with 1 Batch
    Then the cooking Step 3 waits for the Recipe Steps "2"
    And the cooking Step 2 waits for the Recipe Steps ""

  Scenario: An Advance Step that is not done shows a warning until it is marked done
    When I open Cook Mode for the Recipe "Chicken stew" with 1 Batch
    Then the Advance Step "Marinate the chicken" is listed as not done
    When I mark the Advance Step 1 of the Recipe "Chicken stew" as done
    Then the response status is 200
    And the response JSON field "done" is true
    When I open Cook Mode for the Recipe "Chicken stew" with 1 Batch
    Then the Advance Step "Marinate the chicken" is listed as done

  Scenario: Marking is idempotent and survives a restart
    Given I mark the Advance Step 1 of the Recipe "Chicken stew" as done
    And I mark the Advance Step 1 of the Recipe "Chicken stew" as done
    When the Feeder restarts in the kitchen
    And I am signed in as the User
    And I open Cook Mode for the Recipe "Chicken stew" with 1 Batch
    Then the Advance Step "Marinate the chicken" is listed as done

  Scenario: Only an Advance Step can be marked done
    When I mark Step 2 of the Recipe "Chicken stew" as done
    Then the response status is 422
    And the error code is "not_advance_step"

  Scenario: A mark needs a real scope
    When I mark a Step of the scope "nonsense" as done
    Then the response status is 422
    And the error code is "invalid_scope"
    When I mark a Step of the scope "recipe:999999" as done
    Then the response status is 404

  Scenario: Cook Mode for a Planned Meal uses the Batches of the meal
    Given the kitchen has a Dinner Meal Slot on Monday at 19:00
    And the Recipe "Chicken stew" is planned for tonight's Dinner with 2 Batches
    When I open Cook Mode for tonight's Planned Meal
    Then the response status is 200
    And the response JSON field "scope" is "meal:2026-11-09/1"
    And the response JSON field "meal.mealSlotId" is "1"
    And the cooking Step 1 uses 4 piece of "onion"

  Scenario: Marks on a Planned Meal belong to that meal only
    Given the kitchen has a Dinner Meal Slot on Monday at 19:00
    And the Recipe "Chicken stew" is planned for tonight's Dinner with 1 Batch
    When I mark Step 1 of tonight's Planned Meal as done
    Then the response status is 200
    When I open Cook Mode for tonight's Planned Meal
    Then the Advance Step "Marinate the chicken" is listed as done
    When I open Cook Mode for the Recipe "Chicken stew" with 1 Batch
    Then the Advance Step "Marinate the chicken" is listed as not done

  Scenario: A cooked meal can no longer be opened in Cook Mode
    Given the kitchen has a Dinner Meal Slot on Monday at 19:00
    And the Recipe "Chicken stew" is planned for tonight's Dinner with 1 Batch
    And tonight's Planned Meal is marked as cooked
    When I open Cook Mode for tonight's Planned Meal
    Then the response status is 409
    And the error code is "not_cookable"

  Scenario: Cook Mode needs a signed-in User
    When the signed-out visitor asks for Cook Mode
    Then the response status is 401

  # R4 B10: the Cook Mode view carries the household date, so Mark as Cooked can be hidden for a future meal.
  Scenario: Cook Mode for a Planned Meal says what the household date is
    Given the kitchen has a Dinner Meal Slot on Monday at 19:00
    And the Recipe "Chicken stew" is planned for tonight's Dinner with 1 Batch
    When I open Cook Mode for tonight's Planned Meal
    Then the response status is 200
    And the response JSON field "today" is "2026-11-09"
