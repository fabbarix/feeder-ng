Feature: Today screen data
  Today shows the zero-waste streak and the Advance Steps due today. Every
  other tile comes from Planning and Stock.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And Stock knows the Ingredient "spinach" for Today

  Scenario: The streak counts days since the last waste
    Given I bought a Stock Lot of "spinach" on "2026-11-01"
    And I threw away spinach on "2026-11-06"
    When I ask for the zero-waste streak
    Then the streak is 3 days

  Scenario: Waste today resets the streak to zero
    Given I bought a Stock Lot of "spinach" on "2026-11-01"
    And I threw away spinach on "2026-11-09"
    When I ask for the zero-waste streak
    Then the streak is 0 days

  Scenario: With no waste the streak counts from the first Stock Lot
    Given I bought a Stock Lot of "spinach" on "2026-11-01"
    When I ask for the zero-waste streak
    Then the streak is 8 days

  Scenario: With no Stock yet there is no streak
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
