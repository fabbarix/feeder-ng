Feature: Today screen data
  Today shows the zero-waste streak and the Advance Steps due today. Every
  other tile comes from Planning and Stock.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "spinach" for Today

  # Today is 2026-11-09 (noon UTC). R11c: the streak resets when a Lot goes off (the day after its
  # go-off date), is capped at the Household's age, and counts from the Household's creation day.

  Scenario: The streak counts days since the last waste
    Given the Household was created on "2026-10-01"
    And I bought a Stock Lot of "spinach" on "2026-11-01"
    And I threw away spinach on "2026-11-06"
    When I ask for the zero-waste streak
    Then the streak is 3 days

  Scenario: Waste today resets the streak to zero
    Given the Household was created on "2026-10-01"
    And I bought a Stock Lot of "spinach" on "2026-11-01"
    And I threw away spinach on "2026-11-09"
    When I ask for the zero-waste streak
    Then the streak is 0 days

  Scenario: With no Lots the streak is the age of the Household
    Given the Household was created on "2026-11-02"
    When I ask for the zero-waste streak
    Then the streak is 7 days

  Scenario: A Lot that goes off, not acted on, resets the streak on the day it went off
    Given the Household was created on "2026-10-01"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-01"
    When I ask for the zero-waste streak
    Then the streak is 2 days

  Scenario: A Lot still fine on its go-off date does not reset the streak
    Given the Household was created on "2026-10-01"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-04"
    When I ask for the zero-waste streak
    Then the streak is 39 days

  Scenario: Keep on the first day a Lot is spoiled avoids the reset
    Given the Household was created on "2026-10-01"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-03"
    When I keep the gone-off Stock Lot of "chicken"
    And I ask for the zero-waste streak
    Then the streak is 39 days

  Scenario: Keep resets nothing even when the pushed go-off date is still past
    Given the Household was created on "2026-10-01"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-01"
    When I keep the gone-off Stock Lot of "chicken"
    And I ask for the zero-waste streak
    Then the streak is 39 days

  Scenario: A Kept Lot that goes off again resets on that day
    Given the Household was created on "2026-10-01"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-03"
    And I keep the gone-off Stock Lot of "chicken"
    When a day passes
    And I ask for the zero-waste streak
    Then the streak is 0 days

  Scenario: Throwing out a gone-off Lot counts from the day it went off, not the throw-out day
    Given the Household was created on "2026-10-01"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-01"
    And 2 days pass
    When I throw out the gone-off Stock Lot of "chicken"
    And I ask for the zero-waste streak
    Then the streak is 4 days

  Scenario: Throwing out a gone-off Lot on the day it went off is a single waste event
    Given the Household was created on "2026-10-01"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-01"
    When I throw out the gone-off Stock Lot of "chicken"
    And I ask for the zero-waste streak
    Then the streak is 2 days

  Scenario: Cooked uses up a gone-off Lot - streak stays reset
    Given the Household was created on "2026-10-01"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-01"
    When a meal is Cooked using up the "chicken" in Stock
    And I ask for the zero-waste streak
    Then the streak is 2 days

  Scenario: Stock-take removes a gone-off Lot - streak stays reset
    Given the Household was created on "2026-10-01"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-01"
    When I do a Stock-take of "chicken" to nothing
    And I ask for the zero-waste streak
    Then the streak is 2 days

  Scenario: The streak is capped at the Household's age despite backdated purchases
    Given the Household was created on "2026-11-05"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-10-01"
    And I bought a Stock Lot of "spinach" on "2026-01-01"
    And I threw away spinach on "2026-09-01"
    When I ask for the zero-waste streak
    Then the streak is 4 days

  Scenario: A day starts at midnight in the Household time zone
    Given the Household was created on "2026-10-01"
    And the Household's time zone is "Europe/Rome"
    And Stock knows the Ingredient "chicken" with a Shelf Life of 5 days for Today
    And I bought a Stock Lot of "chicken" on "2026-11-04"
    And the kitchen clock reads 23:30 UTC
    When I ask for the zero-waste streak
    Then the streak is 0 days

  Scenario: Advance Steps due today are listed soonest first
    Given the Today facts have dinner "Chicken curry" at 19:30 with the Advance Step "Marinate the chicken" 4 hours ahead
    And the Today facts have dinner "Pizza" at 20:00 with the Advance Step "Prove the dough" 6 hours ahead
    When I ask for today's Advance Steps
    Then the Advance Steps listed are "Prove the dough, Marinate the chicken"

  Scenario: Advance Steps of cooked meals are not listed
    Given the Today facts have dinner "Chicken curry" at 19:30 with the Advance Step "Marinate the chicken" 4 hours ahead
    And the Today facts say "Chicken curry" is cooked
    When I ask for today's Advance Steps
    Then no Advance Steps are listed

  Scenario: Today endpoints need a signed-in User
    Given I am not signed in
    When I GET "/api/today/streak"
    Then the response status is 401
