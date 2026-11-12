@b5-st
Feature: Edit and delete a Stock Lot
  A User corrects a Stock Lot by hand: its quantity, Bought on and Good until. Changing Bought on suggests Good until
  again from the Shelf Life where the Lot is (the frozen Shelf Life in a Freezer) unless Good until is changed in the
  same edit. An edit is a correction: no waste, no Keep, and a Storage Place is changed with Move, not Edit. Delete
  removes a Lot as a mistake (a double Scan): it is not waste, and the go-off of a Lot that had gone off goes with it,
  like the Undo of a Scan (beta.5 F6, spec decision 41, reconcile Q21 to Q22).

  # Today is 2026-11-09 (noon UTC).

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "chicken" in g with a Shelf Life of 5 days
    And Stock knows the Ingredient "peas" in g with a Shelf Life of 5 days and a frozen Shelf Life of 60 days
    And the Household keeps food in the pantry "Kitchen Pantry" by default
    And the Household keeps food in the freezer "Garage Freezer"
    And the Household was created on "2026-10-01"

  Scenario: Correct the quantity of a Stock Lot
    Given I add a Stock Lot of 800 g of "chicken" bought on "2026-11-08"
    When I change the newest Stock Lot of "chicken" with JSON:
      """
      {"quantity": 650}
      """
    Then the response status is 200
    And Stock holds 650 g of "chicken"
    And the changed Stock Lot is good until "2026-11-13"
    And no waste is recorded

  Scenario: Changing Bought on suggests Good until again from the Shelf Life
    Given I add a Stock Lot of 800 g of "chicken" bought on "2026-11-05"
    When I change the newest Stock Lot of "chicken" with JSON:
      """
      {"purchased": "2026-11-08"}
      """
    Then the response status is 200
    And the changed Stock Lot is good until "2026-11-13"

  Scenario: Good until given in the same edit wins over the suggestion
    Given I add a Stock Lot of 800 g of "chicken" bought on "2026-11-05"
    When I change the newest Stock Lot of "chicken" with JSON:
      """
      {"purchased": "2026-11-08", "goesOff": "2026-11-20"}
      """
    Then the changed Stock Lot is good until "2026-11-20"

  Scenario: In a Freezer Bought on suggests Good until from the frozen Shelf Life
    Given I put a Stock Lot of 500 g of "peas" in the "Garage Freezer"
    When I change the newest Stock Lot of "peas" with JSON:
      """
      {"purchased": "2026-11-01"}
      """
    Then the response status is 200
    And the changed Stock Lot is good until "2026-12-31"
    And the changed Stock Lot is in the "Garage Freezer"

  Scenario: A Lot can be left without a Good until
    Given I add a Stock Lot of 800 g of "chicken" bought on "2026-11-08"
    When I change the newest Stock Lot of "chicken" with JSON:
      """
      {"goesOff": null}
      """
    Then the response status is 200
    And the changed Stock Lot has no go-off date

  Scenario Outline: An edit that breaks a rule is refused and changes nothing
    Given I add a Stock Lot of 800 g of "chicken" bought on "2026-11-08"
    When I change the newest Stock Lot of "chicken" with JSON:
      """
      <body>
      """
    Then the response status is 422
    And Stock holds 800 g of "chicken"

    Examples:
      | body                          |
      | {}                            |
      | {"quantity": 0}               |
      | {"quantity": -5}              |
      | {"purchased": "2026-11-10"}   |
      | {"purchased": "last Tuesday"} |
      | {"goesOff": "2026-11-01"}     |

  Scenario: Editing or deleting a Stock Lot that does not exist
    When I change the Stock Lot 4242 with JSON:
      """
      {"quantity": 5}
      """
    Then the response status is 404
    When I delete the Stock Lot 4242
    Then the response status is 404

  Scenario: Moving Good until of a Stock Lot that went off to a later day removes the go-off
    Given I add a Stock Lot of 100 g of "chicken" bought on "2026-11-01"
    And I list the spoiled Stock Lots
    And the spoiled list has 1 Stock Lot
    When I ask for the zero-waste streak
    Then the streak is 2 days
    When I change the newest Stock Lot of "chicken" with JSON:
      """
      {"goesOff": "2026-11-20"}
      """
    And I list the spoiled Stock Lots
    Then the spoiled list has 0 Stock Lots
    When I ask for the zero-waste streak
    Then the streak is 39 days
    And no waste is recorded

  Scenario: Moving Good until earlier can make a Stock Lot spoiled now
    Given I add a Stock Lot of 100 g of "chicken" bought on "2026-11-08"
    When I change the newest Stock Lot of "chicken" with JSON:
      """
      {"goesOff": "2026-11-08"}
      """
    And I list the spoiled Stock Lots
    Then the spoiled list has 1 Stock Lot
    When I ask for the zero-waste streak
    Then the streak is 0 days

  Scenario: Delete removes a Stock Lot without waste
    Given I add a Stock Lot of 800 g of "chicken" bought on "2026-11-08"
    When I delete the newest Stock Lot of "chicken"
    Then the response status is 204
    And Stock holds nothing of "chicken"
    And no waste is recorded

  Scenario: Delete of a Stock Lot that had gone off removes its go-off, like the Undo of a Scan
    Given I add a Stock Lot of 100 g of "chicken" bought on "2026-11-01"
    And I add a Stock Lot of 200 g of "chicken" bought on "2026-11-08"
    When I ask for the zero-waste streak
    Then the streak is 2 days
    When I delete the Stock Lot of 100 g of "chicken"
    Then the response status is 204
    And "chicken" has Stock Lots of 200 g
    When I ask for the zero-waste streak
    Then the streak is 39 days
    And no waste is recorded

  Scenario: Throw out of a gone-off Stock Lot still counts, unlike Delete
    Given I add a Stock Lot of 100 g of "chicken" bought on "2026-11-01"
    When I throw out the spoiled Stock Lot of "chicken"
    And I ask for the zero-waste streak
    Then the streak is 2 days
