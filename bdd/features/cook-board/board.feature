Feature: Kitchen board
  The kitchen board (tablet, /board) refreshes live. It goes dark at local sunset
  and light at sunrise from the household Location; with no coordinates it uses
  19:00 to 07:00. It shows the zero-waste streak and the next Advance Step.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the kitchen knows the Ingredient "onion" in piece

  Scenario: Without a Location the board uses 19:00 to 07:00
    Given the kitchen clock reads 12:00 UTC
    When I open the kitchen board
    Then the response status is 200
    And the kitchen board is light using the fallback
    And the kitchen board explains the fallback with "no_location"
    And the kitchen board changes theme at 19:00 UTC

  Scenario: The fallback turns dark at 19:00
    Given the kitchen clock reads 19:00 UTC
    When I open the kitchen board
    Then the kitchen board is dark using the fallback
    And the kitchen board changes theme at 07:00 UTC

  Scenario: A Location with only a city name cannot be turned into sunset times offline
    Given the kitchen's household settings are:
      """
      {"timeZone": "Europe/Rome", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "location": {"city": "Turin"}, "currency": "EUR"}
      """
    And the kitchen clock reads 12:00 UTC
    When I open the kitchen board
    Then the kitchen board is light using the fallback
    And the kitchen board explains the fallback with "city_only"

  Scenario: With coordinates the board goes dark at the local sunset
    Given the kitchen's household settings are:
      """
      {"timeZone": "Europe/Rome", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
       "quietHours": {"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5,
       "location": {"latitude": 41.9028, "longitude": 12.4964}, "currency": "EUR"}
      """
    And the kitchen clock reads 15:00 UTC
    When I open the kitchen board
    Then the kitchen board is light using the sun
    And the kitchen board changes theme at 15:55 UTC
    When the kitchen clock reads 16:00 UTC
    And I open the kitchen board
    Then the kitchen board is dark using the sun

  # R11c: a Lot going off is the waste event; the throw-out of a gone-off Lot is not a second one.
  Scenario: The zero-waste streak counts the days since a Lot went off
    Given the Household was created on "2026-10-01"
    And the kitchen knows the Ingredient "chicken" in g with a Shelf Life of 4 days
    And the kitchen has a Stock Lot of "chicken" bought on "2026-11-01"
    When I open the kitchen board
    Then the kitchen board shows a zero-waste streak of 3 days
    When the kitchen throws out every spoiled Stock Lot
    And I open the kitchen board
    Then the kitchen board shows a zero-waste streak of 3 days
    When 3 days pass
    And I open the kitchen board
    Then the kitchen board shows a zero-waste streak of 6 days

  Scenario: Nothing in Stock yet is the age of the Household
    Given the Household was created on "2026-11-02"
    When I open the kitchen board
    Then the kitchen board shows a zero-waste streak of 7 days

  Scenario: The next Advance Step comes from the Planned Meals
    Given the kitchen has the Recipe "Chicken stew" yielding 4 with these Steps:
      """
      [
        {"text": "Marinate the chicken", "kind": "advance", "leadTimeMinutes": 240},
        {"text": "Chop the onions", "kind": "active", "durationMinutes": 10, "uses": [{"ingredientId": <id:onion>, "quantity": 2, "unit": "piece"}]},
        {"text": "Simmer the stew", "kind": "passive", "durationMinutes": 45},
        {"text": "Plate up", "kind": "active", "durationMinutes": 5}
      ]
      """
    And the kitchen has a Dinner Meal Slot on Monday at 19:00
    And the Recipe "Chicken stew" is planned for tonight's Dinner with 1 Batch
    And the kitchen clock reads 12:00 UTC
    When I open the kitchen board
    Then the kitchen board's next Advance Step is "Marinate the chicken" for the Recipe "Chicken stew"
    And the kitchen board's next Advance Step is not overdue
    When the kitchen clock reads 16:00 UTC
    And I open the kitchen board
    Then the kitchen board's next Advance Step is overdue
    When I mark Step 1 of tonight's Planned Meal as done
    And I open the kitchen board
    Then the kitchen board has no next Advance Step

  Scenario: The board needs a signed-in User
    When the signed-out visitor asks for the kitchen board
    Then the response status is 401
