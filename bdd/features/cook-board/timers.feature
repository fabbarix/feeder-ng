Feature: Cook Mode timers
  Timers are kept on the server and computed from their start time, so the phone
  and the tablet show the same timers. A Passive Step starts one when reached.

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

  Scenario: A timer started on the phone shows on the tablet
    When the phone starts the timer for Step 3 of the Recipe "Chicken stew"
    Then the response status is 201
    And the response JSON field "state" is "running"
    And the response JSON field "durationSeconds" is "2700"
    And the response JSON field "label" is "Step 2: Simmer the stew"
    And the tablet shows 1 timer
    And the tablet shows the timer "Step 2: Simmer the stew" running with 2700 seconds left

  Scenario: Both devices count down together
    Given the phone starts the timer for Step 3 of the Recipe "Chicken stew"
    When 10 minutes of cooking go by
    Then the phone shows the timer "Step 2: Simmer the stew" running with 2100 seconds left
    And the tablet shows the timer "Step 2: Simmer the stew" running with 2100 seconds left

  Scenario: Pausing on the tablet pauses it on the phone, resuming restarts it
    Given the phone starts the timer for Step 3 of the Recipe "Chicken stew"
    And 5 minutes of cooking go by
    When the tablet pauses the timer "Step 2: Simmer the stew"
    Then the response status is 200
    When 20 minutes of cooking go by
    Then the phone shows the timer "Step 2: Simmer the stew" paused with 2400 seconds left
    When the phone resumes the timer "Step 2: Simmer the stew"
    And 10 minutes of cooking go by
    Then the tablet shows the timer "Step 2: Simmer the stew" running with 1800 seconds left

  Scenario: Pause and resume need the right state
    Given the phone starts a free timer "Eggs" for 300 seconds
    When the phone resumes the timer "Eggs"
    Then the response status is 409
    And the error code is "not_paused"
    When the phone pauses the timer "Eggs"
    And the phone pauses the timer "Eggs"
    Then the response status is 409
    And the error code is "not_running"

  Scenario: Reaching the same Passive Step on both devices starts one timer
    When the phone starts the timer for Step 3 of the Recipe "Chicken stew"
    And 3 seconds of cooking go by
    And the tablet starts the timer for Step 3 of the Recipe "Chicken stew"
    Then the response status is 200
    And the tablet shows 1 timer
    And the tablet shows the timer "Step 2: Simmer the stew" running with 2697 seconds left

  Scenario: Timers keep running across Steps
    Given the phone starts the timer for Step 3 of the Recipe "Chicken stew"
    And the phone starts a free timer "Eggs" for 180 seconds
    When 2 minutes of cooking go by
    Then the tablet shows 2 timers
    And the tablet shows the timer "Eggs" running with 60 seconds left
    And the tablet shows the timer "Step 2: Simmer the stew" running with 2580 seconds left

  Scenario: Only a Passive Step starts a Step timer
    When the phone starts the timer for Step 2 of the Recipe "Chicken stew"
    Then the response status is 422
    And the error code is "not_passive_step"
    When the phone starts the timer for Step 1 of the Recipe "Chicken stew"
    Then the response status is 422
    And the error code is "not_passive_step"

  Scenario: A free timer needs a label and a sensible duration
    When the phone starts a free timer "Eggs" for 0 seconds
    Then the response status is 422
    And the error code is "validation_failed"
    When the phone starts a free timer "Eggs" for 90000 seconds
    Then the response status is 422

  Scenario: A timer that ends is finished, announced once, and stays until dismissed
    Given the push team is listening for finished timers
    And the phone starts a free timer "Eggs" for 60 seconds
    When 61 seconds of cooking go by
    And the finished timers have been read once
    Then a finished event arrives for the timer "Eggs"
    And the tablet shows the timer "Eggs" finished with 0 seconds left
    When the tablet cancels the timer "Eggs"
    Then the response status is 204
    And the phone shows 0 timers

  Scenario: Cancelling on one device removes the timer everywhere
    Given the phone starts a free timer "Eggs" for 300 seconds
    When the tablet cancels the timer "Eggs"
    Then the phone shows 0 timers

  Scenario: Timers survive a restart
    Given the phone starts a free timer "Eggs" for 300 seconds
    And 1 minute of cooking go by
    When the Feeder restarts in the kitchen
    And the phone and the tablet are signed in
    Then the tablet shows the timer "Eggs" running with 240 seconds left

  Scenario: Timers need a signed-in User
    When the signed-out visitor asks for Cook Mode
    Then the response status is 401
