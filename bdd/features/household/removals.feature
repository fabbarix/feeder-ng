@removals @area-household
Feature: Removing a Member or a Meal Slot can be undone and keeps the history
  Removing a Member asks first and says what goes with them, and Undo puts them back with the same id. Removing a
  Meal Slot keeps its Cooked and Not cooked meals, so Last cooked and Cool-down do not change; the Admin can put the
  Meal Slot back from the toast, or later from Removed Meal Slots. Today is Monday 2026-11-09.

  Background:
    Given a running Feeder
    And I am signed in as the Admin
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Sam" with Portion Factor 0.5

  Scenario: Removing a Member asks first and lists what goes
    Given the Household has the Meal Slot "Dinner" on Monday at 19:00 attended by "Anna" and "Sam"
    And the Household has the Meal Slot "Dinner" on Tuesday at 19:00 attended by "Sam"
    And "Sam" has 2 Favourites, Dislikes or Exclusions
    And "Sam" signs in with "sam@example.test"
    When the Admin asks what removing the Member "Sam" would do
    Then the response status is 200
    And the response JSON field "preferences" is "2"
    And the response JSON field "mealSlots" is "2"
    And the response JSON field "signIn.email" is "sam@example.test"
    And the Member "Sam" is still in the Household

  Scenario: The impact of a Member without a sign-in has none
    When the Admin asks what removing the Member "Anna" would do
    Then the response status is 200
    And the response JSON field "signIn" is null

  Scenario: Undo puts a removed Member back
    Given the Household has the Meal Slot "Dinner" on Tuesday at 19:30 attended by "Anna" and "Sam"
    When the Admin deletes the Member "Sam"
    Then the Meal Slot "Dinner" on Tuesday needs 1 portions
    When the Admin undoes the removal of the Member "Sam"
    Then the response status is 200
    And the Member "Sam" is back with the same id
    And the Meal Slot "Dinner" on Tuesday needs 1.5 portions
    And the Member "Sam" still has Portion Factor 0.5

  Scenario: Undo of a removed Member comes too late after ten minutes
    When the Admin deletes the Member "Sam"
    And 11 minutes pass
    And the Admin undoes the removal of the Member "Sam"
    Then the response status is 404

  Scenario: Removing a Meal Slot keeps its Cooked history
    Given the Household has the Meal Slot "Snack" on Monday at 16:30 attended by "Anna"
    And the Meal Slot "Snack" on Monday has the Cooked meal "Pasta" on 2026-11-02
    And the Meal Slot "Snack" on Monday has the Not cooked meal "Pasta" on 2026-10-26
    And the Meal Slot "Snack" on Monday has a meal of "Pasta" on 2026-11-16 still planned
    When the Admin asks what removing the Meal Slot "Snack" on Monday would do
    Then the response JSON field "cookedKept" is "2"
    And the response JSON list "plannedMeals" has at least 1 entries
    When the Admin removes the Meal Slot "Snack" on Monday
    Then the response status is 204
    And the Meal Slot "Snack" on Monday is not in the Meal Slots list
    And the Meal Slot "Snack" on Monday still has 2 resolved meals in the history
    And the Meal Slot "Snack" on Monday has no unresolved meals

  Scenario: Last cooked is unchanged after a Meal Slot is removed
    Given the last-cooked Recipes "Pasta" exist
    And the Recipe "Pasta" was Cooked fresh on 2026-11-02
    When the Admin removes the Meal Slot "Dinner" on Monday
    And I read the Recipe "Pasta"
    Then the Recipe shows last cooked "2026-11-02"

  Scenario: A removed Meal Slot can be put back with Undo
    Given the Household has the Meal Slot "Dinner" on Monday at 19:00 attended by "Anna" and "Sam"
    And the Meal Slot "Dinner" on Monday has a meal of "Pasta" on 2026-11-07 still to confirm
    When the Admin removes the Meal Slot "Dinner" on Monday
    And the Admin undoes the removal of the Meal Slot "Dinner" on Monday
    Then the response status is 200
    And the Meal Slot "Dinner" on Monday is in the Meal Slots list
    And the Meal Slot "Dinner" on Monday needs 1.5 portions
    And the Meal Slot "Dinner" on Monday has an unresolved meal on 2026-11-07

  Scenario: A new Dinner on Monday can be added after the old one was removed
    Given the Household has the Meal Slot "Dinner" on Monday at 19:00 attended by "Anna"
    When the Admin removes the Meal Slot "Dinner" on Monday
    And the Admin adds the Meal Slot "Dinner" on Monday at 20:00 without naming who attends
    Then the response status is 201
    When the Admin undoes the removal of the Meal Slot "Dinner" on Monday
    Then the response status is 409
    And the error code is "meal_slot_name_taken"
    And the error message mentions "There is already a Dinner on Monday."

  Scenario: After removing a Meal Slot, its Cooked meals are listed under Removed Meal Slots
    Given the Household has the Meal Slot "Snack" on Monday at 16:30 attended by "Anna"
    And the Household has the Meal Slot "Snack" on Tuesday at 16:30 attended by "Anna"
    And the Household has the Meal Slot "Tea" on Friday at 16:00 attended by "Anna"
    And the Meal Slot "Snack" on Monday has the Cooked meal "Pasta" on 2026-11-02
    And the Meal Slot "Snack" on Tuesday has the Cooked meal "Pasta" on 2026-11-03
    When the Admin removes the Meal Slot "Snack" on Monday
    And the Admin removes the Meal Slot "Snack" on Tuesday
    And the Admin removes the Meal Slot "Tea" on Friday
    And the User reads the Removed Meal Slots
    Then the response status is 200
    And the Removed Meal Slots list has 1 rows
    And the Removed Meal Slots row "Snack" shows 2 Cooked meals on 2 weekdays

  Scenario: An Admin puts back a removed Meal Slot from its row
    Given the Household has the Meal Slot "Snack" on Monday at 16:30 attended by "Anna"
    And the Household has the Meal Slot "Snack" on Tuesday at 16:30 attended by "Anna"
    And the Meal Slot "Snack" on Monday has the Cooked meal "Pasta" on 2026-11-02
    And the Meal Slot "Snack" on Tuesday has the Cooked meal "Pasta" on 2026-11-03
    When the Admin removes the Meal Slot "Snack" on Monday
    And the Admin removes the Meal Slot "Snack" on Tuesday
    And the Admin puts back every Meal Slot of the Removed Meal Slots row "Snack"
    Then the Meal Slot "Snack" on Monday is in the Meal Slots list
    And the Meal Slot "Snack" on Tuesday is in the Meal Slots list
    And the Admin reads the Removed Meal Slots
    Then the Removed Meal Slots list has 0 rows

  Scenario: A Recipe's Last cooked date is unchanged after its Meal Slot is removed and put back
    Given the last-cooked Recipes "Pasta" exist
    And the Recipe "Pasta" was Cooked fresh on 2026-11-02
    When the Admin removes the Meal Slot "Dinner" on Monday
    And the Admin undoes the removal of the Meal Slot "Dinner" on Monday
    And I read the Recipe "Pasta"
    Then the Recipe shows last cooked "2026-11-02"

  Scenario: A plain User cannot remove, put back or ask about removals
    Given the Household has the Meal Slot "Dinner" on Monday at 19:00 attended by "Anna"
    When the User asks what removing the Meal Slot "Dinner" on Monday would do
    Then the response status is 403
    When the User removes the Meal Slot "Dinner" on Monday
    Then the response status is 403
    And the Meal Slot "Dinner" on Monday is in the Meal Slots list
