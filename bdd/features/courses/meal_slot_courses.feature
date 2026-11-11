@crs-c1
Feature: Courses on a Meal Slot
  A Meal Slot serves an ordered list of Courses. Each is required or optional, and Members may opt out of it
  (ADR 0008 points 7 and 8, spec 3.1). The Admin edits them; editing several weekdays at once can preview what goes.

  Background:
    Given a running Feeder
    And I am signed in as the Admin
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Sam" with Portion Factor 0.5
    And the Household has the Meal Slot "Dinner" on Monday at 19:00 attended by "Anna" and "Sam"
    And the Household has the Meal Slot "Dinner" on Tuesday at 19:00 attended by "Anna"

  Scenario: A new Meal Slot serves the main Course, required
    Then the Meal Slot "Dinner" on Monday serves "Main"
    And the Meal Slot "Dinner" on Monday shows the main Course as "Main"

  Scenario: A Meal Slot keeps the order, the optional flag and who opts out
    When the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Side", "Main" optional without "Sam", "Dessert" optional
    Then the response status is 200
    And the Meal Slot "Dinner" on Monday serves "Side", "Main" optional without "Sam", "Dessert" optional

  Scenario: Creating a Meal Slot with Courses
    When the Admin creates the Meal Slot "Brunch" on Sunday with the Courses "Main", "Starter" optional
    Then the response status is 201
    And the Meal Slot "Brunch" on Sunday serves "Main", "Starter" optional

  Scenario: At least one Course stays required
    When the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Main" optional, "Side" optional
    Then the response status is 422
    And the error code is "validation_failed"
    And the error names the field "courses" and the reason "courses_all_optional"
    And the Meal Slot "Dinner" on Monday serves "Main"

  Scenario: The main Course may be optional when another Course is required
    When the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Main" optional, "Side"
    Then the response status is 200
    And the Meal Slot "Dinner" on Monday serves "Main" optional, "Side"

  Scenario: A Meal Slot needs a Course
    When the Admin saves the Meal Slot "Dinner" on Monday with an empty list of Courses
    Then the response status is 422
    And the error names the field "courses" and the reason "courses_empty"

  Scenario: Only the Admin edits a Meal Slot's Courses
    Given I am signed in as the User
    When I PATCH "/api/meal-slots/batch" with JSON:
      """
      {"match": "Dinner", "weekdays": [1], "set": {"courses": [{"id": 1}]}}
      """
    Then the response status is 403

  Scenario: Reordering a Meal Slot's Courses keeps who opts out
    Given the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Main", "Side" without "Sam"
    When the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Side", "Main"
    Then the Meal Slot "Dinner" on Monday serves "Side" without "Sam", "Main"

  Scenario: Taking Side off a Meal Slot drops its opt-outs and its unresolved Planned Meals
    Given the Household has the Recipe "Greens" for the Courses "Side"
    And the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Main", "Side" without "Sam"
    And the Meal Slot "Dinner" on Monday has a Pinned Planned Meal of "Greens" in "Side" on 2026-11-16
    And the Meal Slot "Dinner" on Monday has an unpinned Planned Meal of "Greens" in "Side" on 2026-11-23
    And the Meal Slot "Dinner" on Monday has a cooked Planned Meal of "Greens" in "Side" on 2026-11-30
    And the Meal Slot "Dinner" on Monday has a Slot Rule for "Greens" in "Side"
    When the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Main"
    Then the response status is 200
    And the answer has no field "removes"
    And the Meal Slot "Dinner" on Monday has 0 unresolved Planned Meals in "Side" from today on
    And the Meal Slot "Dinner" on Monday has 0 Slot Rules in "Side"
    When the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Main", "Side"
    Then the Meal Slot "Dinner" on Monday serves "Main", "Side"

  Scenario: A batch edit applies the Courses to every Matching Meal Slot
    When the Admin saves "Dinner" on Monday and Tuesday with the Courses "Main", "Side" optional without "Sam"
    Then the response status is 200
    And the Meal Slot "Dinner" on Monday serves "Main", "Side" optional without "Sam"
    And the Meal Slot "Dinner" on Tuesday serves "Main", "Side" optional

  Scenario: The preview names what a batch edit would remove and writes nothing
    Given the Household has the Recipe "Greens" for the Courses "Side"
    And the Household has the Recipe "Peas" for the Courses "Side"
    And the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Main", "Side"
    And the Meal Slot "Dinner" on Monday has an unpinned Planned Meal of "Peas" in "Side" on 2026-11-16
    And the Meal Slot "Dinner" on Monday has a Pinned Planned Meal of "Greens" in "Side" on 2026-11-23
    And the Meal Slot "Dinner" on Monday has a Slot Rule for "Greens" in "Side"
    And I note how many unresolved Planned Meals the Meal Slot "Dinner" on Monday has in "Side" from today on
    When the Admin previews "Dinner" on Monday with the Courses "Main"
    Then the response status is 200
    And the answer lists under removes the Pinned Planned Meal of "Greens" in "Side" on 2026-11-23
    And the answer lists under removes the Planned Meal of "Peas" in "Side" on 2026-11-16
    And the answer lists under removes the Slot Rule for "Greens" in "Side"
    And the answer lists the Pinned Planned Meals first
    And the Meal Slot "Dinner" on Monday serves "Main", "Side"
    And the Meal Slot "Dinner" on Monday still has as many unresolved Planned Meals in "Side" from today on
    And the Meal Slot "Dinner" on Monday has 1 Slot Rule in "Side"

  Scenario: Saving the batch edit answers what it removed
    Given the Household has the Recipe "Greens" for the Courses "Side"
    And the Admin saves the Meal Slot "Dinner" on Monday with the Courses "Main", "Side"
    And the Meal Slot "Dinner" on Monday has an unpinned Planned Meal of "Greens" in "Side" on 2026-11-16
    When the Admin saves "Dinner" on Monday with the Courses "Main"
    Then the response status is 200
    And the answer lists under removes the Planned Meal of "Greens" in "Side" on 2026-11-16
    And the Meal Slot "Dinner" on Monday has 0 unresolved Planned Meals in "Side" from today on

  Scenario: A batch edit that removes nothing still answers removes
    When the Admin saves "Dinner" on Monday and Tuesday with the Courses "Main", "Side"
    Then the answer removes nothing

  Scenario: The batch ignores an opt-out of a Member who does not attend that Meal Slot
    When the Admin saves "Dinner" on Monday and Tuesday with the Courses "Main", "Side" without "Sam"
    Then the Meal Slot "Dinner" on Monday serves "Main", "Side" without "Sam"
    And the Meal Slot "Dinner" on Tuesday serves "Main", "Side"
