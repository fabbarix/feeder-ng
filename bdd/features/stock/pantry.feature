Feature: Pantry: Storage Places
  The Household keeps its Stock in Storage Places (Kitchen Pantry, Garage Fridge, Garage Freezer, ...), each a
  pantry, a fridge or a freezer. A new Stock Lot goes where its Ingredient was last put, else to the default Storage
  Place. In a Freezer a Lot keeps for the Ingredient's frozen Shelf Life; out of it, the ordinary Shelf Life starts
  again. Any User manages Storage Places.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "minced beef" in g with a Shelf Life of 2 days and a frozen Shelf Life of 90 days
    And Stock knows the Ingredient "rice" in g with no Shelf Life
    And the Household keeps food in the pantry "Kitchen Pantry" by default
    And the Household keeps food in the fridge "Garage Fridge"
    And the Household keeps food in the freezer "Garage Freezer"

  Scenario: Any User lists, renames and re-kinds Storage Places; names are unique
    Then the Storage Places are "Garage Freezer (freezer); Garage Fridge (fridge); Kitchen Pantry (pantry, default)"
    When I change the Storage Place "Garage Fridge" with JSON:
      """
      {"name": "Kitchen Fridge", "kind": "fridge", "default": true}
      """
    Then the response status is 200
    And the Storage Places are "Garage Freezer (freezer); Kitchen Fridge (fridge, default); Kitchen Pantry (pantry)"
    When I POST "/api/storage-places" with JSON:
      """
      {"name": "  kitchen   FRIDGE ", "kind": "fridge"}
      """
    Then the response status is 409
    And the error code is "name_taken"
    When I POST "/api/storage-places" with JSON:
      """
      {"name": "Shed", "kind": "cellar"}
      """
    Then the response status is 422

  Scenario: A Lot put in a Freezer keeps for the frozen Shelf Life
    When I put a Stock Lot of 500 g of "minced beef" in the "Garage Freezer"
    Then the response status is 201
    And the Stock Lot just added is in the "Garage Freezer"
    And the Stock Lot just added is good until 90 days from today

  Scenario: A new Lot goes where its Ingredient was last put, else to the default Storage Place
    When I add a Stock Lot of 1000 g of "rice" without saying where
    Then the Stock Lot just added is in the "Kitchen Pantry"
    When I put a Stock Lot of 500 g of "minced beef" in the "Garage Freezer"
    And I add a Stock Lot of 400 g of "minced beef" without saying where
    Then the Stock Lot just added is in the "Garage Freezer"
    And the Stock Lot just added is good until 90 days from today

  Scenario: Moving a Lot into the Freezer and out again restarts its go-off date
    When I put a Stock Lot of 500 g of "minced beef" in the "Garage Fridge"
    Then the Stock Lot just added is good until 2 days from today
    When I move it to the "Garage Freezer"
    Then the response status is 200
    And the Stock Lot just added is in the "Garage Freezer"
    And the Stock Lot just added is good until 90 days from today
    When I move it to the "Garage Fridge"
    Then the Stock Lot just added is good until 2 days from today

  Scenario: Moving part of a Lot splits it; the rest stays where it was
    When I put a Stock Lot of 1000 g of "minced beef" in the "Garage Fridge"
    And the Stock Lot just added is in the "Garage Fridge"
    When I move 400 g of it to the "Garage Freezer"
    Then the Stock Lot just added is in the "Garage Freezer"
    And the Stock Lot just added is good until 90 days from today
    And "minced beef" has Stock Lots of 600, 400 g

  Scenario: A Lot cannot move more than it holds, nor to a place that does not exist
    When I put a Stock Lot of 300 g of "minced beef" in the "Garage Fridge"
    And the Stock Lot just added is in the "Garage Fridge"
    When I move 301 g of it to the "Garage Freezer"
    Then the response status is 422

  Scenario: Deleting a Storage Place keeps its Lots in Stock, not sorted
    When I put a Stock Lot of 300 g of "minced beef" in the "Garage Fridge"
    And the Stock Lot just added is in the "Garage Fridge"
    When I delete the Storage Place "Garage Fridge"
    Then the response status is 204
    And the Stock Lot I put away is not in any Storage Place now
    And "minced beef" has Stock Lots of 300 g
