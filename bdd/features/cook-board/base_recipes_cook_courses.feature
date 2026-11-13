@br-g
Feature: The Courses of a slot share the jar in Cook Mode, as Mark all Cooked does (beta.6, docs/dev/design/base-recipes.md section 9)
  Lasagne (Main) and Spinach bake (Side) each call for 500 g of Béchamel, one Batch each, and the Pantry holds one jar of
  600 g. Cook Mode gives the jar to the Main, which comes first in the slot's order; the Side finds 100 g, so it makes its
  Béchamel. Monday 2026-11-09, Dinner at 19:00 (C2 household, UTC). Béchamel: "Melt the butter" (5 min Active), "Simmer the
  sauce" (20 min Passive). Lasagne: "Layer the lasagne" (10 Active), "Bake" (30 Passive). Spinach bake: "Mix" (10 Active),
  "Bake the gratin" (20 Passive).

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the BR-G Base recipe "Béchamel" yields 1000 g, needs "800 g milk, 100 g butter, 100 g flour" and has these Steps:
      """
      [{"text": "Melt the butter", "kind": "active", "durationMinutes": 5},
       {"text": "Simmer the sauce", "kind": "passive", "durationMinutes": 20, "after": [0]}]
      """
    And the BR-G Recipe "Lasagne" for the Course "Main" yields 4, needs "200 g pasta, 500 g Béchamel" and has these Steps:
      """
      [{"text": "Layer the lasagne", "kind": "active", "durationMinutes": 10},
       {"text": "Bake", "kind": "passive", "durationMinutes": 30, "after": [0]}]
      """
    And the BR-G Recipe "Spinach bake" for the Course "Side" yields 2, needs "100 g spinach, 500 g Béchamel" and has these Steps:
      """
      [{"text": "Mix", "kind": "active", "durationMinutes": 10},
       {"text": "Bake the gratin", "kind": "passive", "durationMinutes": 20, "after": [0]}]
      """
    And the BR-G Stock holds 600 g of "Béchamel"
    And the C2 plan is empty
    And the C2 plan has "Lasagne" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan has "Spinach bake" in the Course "Side" on 2026-11-09 as planned

  Scenario: The Main's Béchamel is covered and the Side's is not
    When I open the cooking timeline of 2026-11-09
    Then the response status is 200
    And the timeline has 2 items for the Course "Main", 0 of them labelled "Béchamel"
    And the timeline has 4 items for the Course "Side", 2 of them labelled "Béchamel"
    And Cook Mode marks "Béchamel" as covered by Stock

  Scenario: The Side's own view still makes its Béchamel
    When I open Cook Mode for the Course "Side" on 2026-11-09
    Then the Cook Mode view lists 4 Steps
    And Cook Mode view Step 1 is "Melt the butter" labelled "Béchamel"

  Scenario: The Main's own view takes the jar
    When I open Cook Mode for the Course "Main" on 2026-11-09
    Then the Cook Mode view lists 2 Steps
