@b9-stock-undo
Feature: Stock Undo, Keep with a date and Put away (beta.9, B9-05)
  Throw out can be undone on the day it was done: the Stock Lot comes back with its id and dates and the waste
  record goes. Keep makes a spoiled Stock Lot "Good until today" in one tap, or until a later date the User picks.
  Put away moves Not sorted Stock Lots into Storage Places in one request, all or none. Today is 2026-11-09.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "chicken thighs" in g with a Shelf Life of 4 days
    And Stock knows the Ingredient "milk" in ml with no Shelf Life
    And Stock knows the Ingredient "eggs" in piece with a Shelf Life of 21 days

  Scenario: Throw out can be undone and the Stock Lot comes back as it was
    Given I add a Stock Lot of 200 g of "chicken thighs" bought on "2026-11-01"
    When I throw out the spoiled Stock Lot of "chicken thighs"
    And I undo the latest Throw out
    Then the response status is 200
    And Stock holds 200 g of "chicken thighs"
    And there are no waste records
    When I list the spoiled Stock Lots
    Then the spoiled list has 1 Stock Lot
    And the spoiled list includes the Stock Lot of 200 g of "chicken thighs"

  Scenario: Undoing a Throw out twice changes nothing more
    Given I add a Stock Lot of 200 g of "chicken thighs" bought on "2026-11-01"
    And I throw out the spoiled Stock Lot of "chicken thighs"
    And I undo the latest Throw out
    When I undo the Throw out recorded before
    Then the response status is 404
    And Stock holds 200 g of "chicken thighs"

  Scenario: Throw out cannot be undone the next day
    Given I add a Stock Lot of 200 g of "chicken thighs" bought on "2026-11-01"
    And I throw out the spoiled Stock Lot of "chicken thighs"
    When a day passes
    And I undo the latest Throw out
    Then the response status is 409
    And the error code is "undo_window_over"
    And Stock holds nothing of "chicken thighs"

  Scenario: Keep takes a spoiled Stock Lot off the tile until today
    Given I add a Stock Lot of 200 g of "chicken thighs" bought on "2026-10-01"
    When I keep the spoiled Stock Lot of "chicken thighs"
    Then the response status is 200
    And the response JSON field "goesOff" is "2026-11-09"
    And the response JSON field "spoiled" is false
    When I list the spoiled Stock Lots
    Then the spoiled list has 0 Stock Lots
    When a day passes
    And I list the spoiled Stock Lots
    Then the spoiled list has 1 Stock Lot

  Scenario: Change sets a later Good until
    Given I add a Stock Lot of 200 g of "chicken thighs" bought on "2026-10-01"
    And I keep the spoiled Stock Lot of "chicken thighs"
    When I keep the Stock Lot of "chicken thighs" until "2026-11-12"
    Then the response status is 200
    And the response JSON field "goesOff" is "2026-11-12"
    And the response JSON field "spoiled" is false
    When I keep the Stock Lot of "chicken thighs" until "2026-11-08"
    Then the response status is 422
    And the error code is "validation_failed"
