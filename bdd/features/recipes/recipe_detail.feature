Feature: The Recipe detail
  The Recipe's own page says what it holds: its description and Source, the Yield with its unit, how many Steps there are
  (a Step without a Duration is not "No Steps"), and whether the Recipe can be deleted at all.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Ingredient "flour" exists with Base Unit "g"
    And I have created the Recipe "Pancakes" tagged "sweet"
    And I have created the Recipe "Waffles" tagged "sweet"

  Scenario: Deleting a planned Recipe offers only Archive
    Given the Recipe "Pancakes" has been planned
    When I open the Recipe "Pancakes"
    Then the response status is 200
    And the Recipe JSON "deletable" is "false"
    When I open the Recipe "Waffles"
    Then the Recipe JSON "deletable" is "true"
    When I archive the Recipe "Pancakes"
    And I open the Recipe "Pancakes"
    Then the Recipe JSON "archived" is "true"
    And the Recipe JSON "deletable" is "false"

  Scenario: A Recipe that was never planned says it can be deleted, and nothing changes when it is asked twice
    When I open the Recipe "Waffles"
    Then the Recipe JSON "deletable" is "true"
    When I open the Recipe "Waffles"
    Then the Recipe JSON "deletable" is "true"
    And the Recipe JSON "archived" is "false"

  Scenario: Archiving a Recipe can be undone
    When I archive the Recipe "Waffles"
    Then the Recipe JSON "archived" is "true"
    When I unarchive the Recipe "Waffles"
    Then the response status is 200
    And the Recipe JSON "archived" is "false"
    When I list the Recipes
    Then the Recipe names are "Pancakes, Waffles"

  Scenario: A Recipe's description and its Source are on its page
    When I create a Recipe with JSON:
      """
      {
        "name": "Pasta al pomodoro", "yield": 4,
        "description": "A quick weeknight tomato sauce with garlic and basil.",
        "source": {"url": "https://example.test/pasta", "attribution": "Nonna Lucia"},
        "lines": [{"ingredientId": <id:flour>, "quantity": 200, "unit": "g"}]
      }
      """
    Then the response status is 201
    When I open the Recipe "Pasta al pomodoro"
    Then the Recipe JSON "description" is "A quick weeknight tomato sauce with garlic and basil."
    And the Recipe JSON "source.url" is "https://example.test/pasta"
    And the Recipe JSON "source.attribution" is "Nonna Lucia"

  Scenario: A Base recipe of 800 g says 800 g per Batch
    When I create a Recipe with JSON:
      """
      {
        "name": "Pizza dough", "yield": 800, "yieldUnit": "g", "baseRecipe": true,
        "lines": [{"ingredientId": <id:flour>, "quantity": 800, "unit": "g"}]
      }
      """
    Then the response status is 201
    When I open the Recipe "Pizza dough"
    Then the Recipe JSON "baseRecipe" is "true"
    And the Recipe JSON "yield" is "800"
    And the Recipe JSON "yieldUnit" is "g"

  Scenario: A Recipe whose Steps have no Duration says no time is set, not that it has no Steps
    When I create a Recipe with JSON:
      """
      {
        "name": "Green salad", "yield": 2,
        "lines": [{"ingredientId": <id:flour>, "quantity": 10, "unit": "g"}],
        "steps": [
          {"text": "Wash the leaves", "kind": "active", "durationMinutes": 0},
          {"text": "Toss with the dressing", "kind": "active", "durationMinutes": 0}
        ]
      }
      """
    Then the response status is 201
    When I open the Recipe "Green salad"
    Then the Recipe JSON "totalMinutes" is "0"
    And the Recipe JSON "advanceMinutes" is "0"
    And the Recipe JSON "steps.1.text" is "Toss with the dressing"
    When I list the Recipes
    Then the listed Recipe "Green salad" has "stepCount" "2"
    And the listed Recipe "Green salad" has "totalMinutes" "0"
    And the listed Recipe "Pancakes" has "stepCount" "0"
