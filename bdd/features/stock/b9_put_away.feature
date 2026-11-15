@b9-stock-undo @area-stock
Feature: Put away a whole shop at once (beta.9, B9-05, SSP-10)
  Not sorted Stock Lots are moved into Storage Places in one request that applies all of it or none. Each move
  remembers where the Ingredient was last put, as a single move does. A Stock Lot somebody sorted meanwhile is left
  where it is. Today is 2026-11-09.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "eggs" in piece with a Shelf Life of 21 days
    And Stock knows the Ingredient "milk" in ml with no Shelf Life
    And Stock knows the Ingredient "rice" in g with no Shelf Life
    And the Household keeps food in the fridge "Kitchen Fridge"
    And the Household keeps food in the pantry "Kitchen Pantry"
    And I add a Stock Lot of 6 piece of "eggs" bought on "2026-11-08"
    And I add a Stock Lot of 1000 ml of "milk" bought on "2026-11-08"
    And I add a Stock Lot of 500 g of "rice" bought on "2026-11-08"

  Scenario: Put away moves the ticked Stock Lots to the chosen Storage Places
    When I put away the Stock Lot of "eggs" into the "Kitchen Fridge" and of "milk" into the "Kitchen Pantry"
    Then the response status is 200
    And the Stock Lot of "eggs" is in the "Kitchen Fridge"
    And the Stock Lot of "milk" is in the "Kitchen Pantry"
    And the Stock Lot of "rice" is not in any Storage Place

  Scenario: The next purchase of that Ingredient goes there
    Given I put away the Stock Lot of "milk" into the "Kitchen Pantry"
    When I add a Stock Lot of 500 ml of "milk" without saying where
    Then the Stock Lot just added is in the "Kitchen Pantry"

  Scenario: A Put away that names an unknown Storage Place moves nothing
    When I put away the Stock Lot of "eggs" into the "Kitchen Fridge" and of "milk" into the Storage Place 9999
    Then the response status is 422
    And the error code is "validation_failed"
    And the Stock Lot of "eggs" is not in any Storage Place

  Scenario: A Stock Lot sorted meanwhile is skipped
    Given I put away the Stock Lot of "eggs" into the "Kitchen Pantry"
    When I put away the Stock Lot of "eggs" into the "Kitchen Fridge" and of "rice" into the "Kitchen Fridge"
    Then the response status is 200
    And the put away skipped 1 Stock Lot
    And the Stock Lot of "eggs" is in the "Kitchen Pantry"
    And the Stock Lot of "rice" is in the "Kitchen Fridge"
