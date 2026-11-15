@b9-40
Feature: Cook Mode Step, API half (B9-40)
  The Step layout, the timer strip, the held line, the tap zones and Reheat are screen behaviour, covered by the web unit tests and the page-layout
  scenarios. These scenarios are the API they stand on: the timeline of a meal that is not due yet opens (so the cook can prep a day ahead) but cannot be
  marked Cooked (so the last Step's "Back to Plan" is honest), and a cancelled timer can be started again with what was left (the Undo of "Timer cancelled").

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Recipe "Roast chicken" for the Course "Main" uses 300 g of "chicken" and has a 20 minute active Step
    And the C2 Recipe "Green beans" for the Course "Side" uses 100 g of "beans" and has a 10 minute active Step
    And the C2 plan is empty

  # The Dinner is on Mondays, so "a meal that is not due yet" is next Monday; the household's today is Monday 2026-11-09.
  Scenario: The last Step of a meal that is not due yet tells me when I can mark it Cooked
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-16 as planned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-16 as planned
    When I open the cooking timeline of 2026-11-16
    Then the response status is 200
    And the timeline lists 2 items
    When I mark as Cooked the Course "Main" on 2026-11-16
    Then the response status is 409
    And the error code is "future_meal"
    When I mark the whole slot on 2026-11-16 as Not cooked
    Then the response status is 409
    And the error code is "future_meal"

  Scenario: The same meal can be marked once its day comes
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-16 as planned
    And the household clock is 2026-11-16 08:00 UTC
    When I mark as Cooked the Course "Main" on 2026-11-16
    Then the response status is 200

  Scenario: I can undo a cancelled timer
    Given the phone and the tablet are signed in
    And the phone starts a free timer "Pre-heat the oven" for 900 seconds
    When 10 minutes of cooking go by
    Then the phone shows the timer "Pre-heat the oven" running with 300 seconds left
    When the phone cancels the timer "Pre-heat the oven"
    Then the phone shows 0 timers
    When the phone starts a free timer "Pre-heat the oven" for 300 seconds
    Then the phone shows 1 timer
    And the phone shows the timer "Pre-heat the oven" running with 300 seconds left
