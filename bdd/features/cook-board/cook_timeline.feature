@crs-c2
Feature: The cooking timeline of a Meal Slot
  Cook Mode for a slot interleaves the Steps of every fresh Course and the Reheat of every Leftover Course so that one cook
  never has two Active Steps at once and everything is ready together (spec 11, ADR 0008 point 9). One Course on its
  own is still available, and the kitchen board carries the slot's Courses.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Recipe "Roast chicken" for the Course "Main" uses 300 g of "chicken" and has a 20 minute active Step
    And the C2 Recipe "Green beans" for the Course "Side" uses 100 g of "beans" and has a 10 minute active Step
    And the C2 plan is empty

  Scenario: Two Courses with Active Steps take their lengths added up
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    When I open the cooking timeline of 2026-11-09
    Then the response status is 200
    And the timeline takes 30 minutes and starts at 18:30 UTC
    And the timeline lists 2 items
    And timeline item 1 is the active item of the Course "Side" from 0 to 600 seconds
    And timeline item 2 is the active item of the Course "Main" from 600 to 1800 seconds

  Scenario: A Leftover Course adds a Reheat that ends with the meal
    Given the C2 Recipe "Green beans" was cooked in the Course "Side" on 2026-11-08
    And the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan has "Green beans" on 2026-11-09 served in the Course "Side" from the Leftover of 2026-11-08
    When I open the cooking timeline of 2026-11-09
    Then the timeline takes 20 minutes and starts at 18:40 UTC
    And timeline item 2 is the reheat item of the Course "Side" from 1020 to 1200 seconds

  Scenario: A Cooked Course leaves the timeline
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as cooked
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    When I open the cooking timeline of 2026-11-09
    Then the timeline takes 10 minutes and starts at 18:50 UTC
    And the timeline lists 1 items

  Scenario: Nothing to cook once the slot is resolved
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as cooked
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as skipped
    When I open the cooking timeline of 2026-11-09
    Then the response status is 409
    And the answer JSON at "error.code" is "not_cookable"

  Scenario: One Course on its own is that Course's Cook view
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    When I open Cook Mode for the Course "Side" on 2026-11-09
    Then the response status is 200
    And the answer JSON at "recipeName" is "Green beans"
    And the answer JSON at "meal.courseName" is "Side"

  Scenario: The old two-part path is the main Course, never the timeline
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    When I open Cook Mode for 2026-11-09 by the old two-part path
    Then the response status is 200
    And the answer JSON at "recipeName" is "Roast chicken"
    And the answer JSON at "meal.courseName" is "Main"

  Scenario: The board carries tonight's Courses and the time they take
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    Then the board shows tonight's slot with 2 Courses taking 30 minutes
