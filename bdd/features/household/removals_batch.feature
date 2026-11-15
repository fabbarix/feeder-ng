@removals
Feature: Removing a Meal Slot on several days is one step, and so is putting it back
  In the Edit Meal Slot sheet, Remove acts on the days chosen in the sheet: the Admin removes Dinner on every day it
  runs in one go, and one Undo puts every day back. Either all of the days go, or none do; either all come back, or
  none do. Today is Monday 2026-11-09.

  Background:
    Given a running Feeder
    And I am signed in as the Admin
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Meal Slot "Dinner" on Monday at 19:00 attended by "Anna"
    And the Household has the Meal Slot "Dinner" on Tuesday at 19:00 attended by "Anna"
    And the Household has the Meal Slot "Dinner" on Wednesday at 19:00 attended by "Anna"

  Scenario: Removing Dinner on three days takes all three away and one Undo puts them all back
    Given the Meal Slot "Dinner" on Monday has a meal of "Pasta" on 2026-11-07 still to confirm
    When the Admin removes the Meal Slot "Dinner" on Monday, Tuesday and Wednesday at once
    Then the response status is 204
    And the Meal Slot "Dinner" on Monday is not in the Meal Slots list
    And the Meal Slot "Dinner" on Tuesday is not in the Meal Slots list
    And the Meal Slot "Dinner" on Wednesday is not in the Meal Slots list
    When the Admin undoes the removal of those Meal Slots at once
    Then the response status is 200
    And the response JSON list "slots" has 3 entries
    And the Meal Slot "Dinner" on Monday is in the Meal Slots list
    And the Meal Slot "Dinner" on Tuesday is in the Meal Slots list
    And the Meal Slot "Dinner" on Wednesday is in the Meal Slots list
    And the Meal Slot "Dinner" on Monday has an unresolved meal on 2026-11-07

  Scenario: A Remove that names a Meal Slot already removed removes nothing
    When the Admin removes the Meal Slot "Dinner" on Wednesday
    And the Admin removes the Meal Slot "Dinner" on Monday, Tuesday and Wednesday at once
    Then the response status is 409
    And the error code is "meal_slot_removed"
    And the Meal Slot "Dinner" on Monday is in the Meal Slots list
    And the Meal Slot "Dinner" on Tuesday is in the Meal Slots list

  Scenario: An Undo over a name taken on some of the days puts nothing back and names those days
    When the Admin removes the Meal Slot "Dinner" on Monday, Tuesday and Wednesday at once
    And the Admin adds the Meal Slot "Dinner" on Monday at 20:00 without naming who attends
    And the Admin adds the Meal Slot "Dinner" on Wednesday at 20:00 without naming who attends
    And the Admin undoes the removal of those Meal Slots at once
    Then the response status is 409
    And the error code is "meal_slot_name_taken"
    And the error message mentions "There is already a Dinner on Monday and Wednesday."
    And the Meal Slot "Dinner" on Tuesday is not in the Meal Slots list

  Scenario: A Removed Meal Slots row is put back in one call
    Given the Meal Slot "Dinner" on Monday has the Cooked meal "Pasta" on 2026-11-02
    And the Meal Slot "Dinner" on Tuesday has the Cooked meal "Pasta" on 2026-11-03
    When the Admin removes the Meal Slot "Dinner" on Monday, Tuesday and Wednesday at once
    And the Admin reads the Removed Meal Slots
    Then the Removed Meal Slots list has 1 rows
    When the Admin puts back the Removed Meal Slots row "Dinner" in one call
    Then the response status is 200
    And the Meal Slot "Dinner" on Monday is in the Meal Slots list
    And the Meal Slot "Dinner" on Tuesday is in the Meal Slots list

  Scenario: A plain User cannot remove or put back several Meal Slots
    When the User removes the Meal Slot "Dinner" on Monday, Tuesday and Wednesday at once
    Then the response status is 403
    And the Meal Slot "Dinner" on Monday is in the Meal Slots list
