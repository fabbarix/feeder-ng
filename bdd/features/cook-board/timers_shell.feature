@pc04
Feature: Timers outside Cook Mode (PC-04)
  The household's timers live on the server, not on the screen that started them. Every screen of the app, and every device,
  reads the same list, so the shell can show the soonest timer and alert when one finishes. (The pill, the banner and the
  resume Step are covered by the web unit tests; this is the API half they stand on.)

  Background:
    Given a running Feeder
    And the phone and the tablet are signed in
    And the kitchen knows the Ingredient "onion" in piece
    And the kitchen has the Recipe "Chicken stew" yielding 4 with these Steps:
      """
      [
        {"text": "Marinate the chicken", "kind": "advance", "leadTimeMinutes": 240},
        {"text": "Chop the onions", "kind": "active", "durationMinutes": 10, "uses": [{"ingredientId": <id:onion>, "quantity": 2, "unit": "piece"}]},
        {"text": "Simmer the stew", "kind": "passive", "durationMinutes": 45},
        {"text": "Plate up", "kind": "active", "durationMinutes": 5}
      ]
      """

  Scenario: A timer keeps showing when I leave Cook Mode
    Given the phone starts the timer for Step 3 of the Recipe "Chicken stew"
    When 10 minutes of cooking go by
    Then the tablet shows 1 timer
    And the tablet shows the timer "Step 2: Simmer the stew" of the Recipe "Chicken stew" at Step 3
    And the tablet shows the timer "Step 2: Simmer the stew" running with 2100 seconds left

  Scenario: A timer finishing on another screen is a finished timer for every device
    Given the phone starts the timer for Step 3 of the Recipe "Chicken stew"
    When 46 minutes of cooking go by
    Then the tablet shows the timer "Step 2: Simmer the stew" finished with 0 seconds left
    And the phone shows the timer "Step 2: Simmer the stew" finished with 0 seconds left
    And the tablet shows the timer "Step 2: Simmer the stew" of the Recipe "Chicken stew" at Step 3

  Scenario: A finished timer stays until it is dismissed, and dismissing it on one device clears it on the other
    Given the phone starts the timer for Step 3 of the Recipe "Chicken stew"
    And 46 minutes of cooking go by
    When the phone cancels the timer "Step 2: Simmer the stew"
    Then the response status is 204
    And the tablet shows 0 timers

  Scenario: A free timer shows with no Recipe
    Given the phone starts a free timer "Eggs" for 180 seconds
    Then the tablet shows 1 timer
    And the tablet shows the timer "Eggs" with no Recipe
