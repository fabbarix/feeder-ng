@br-g
Feature: Cook Mode walks the Steps of the Base recipes a Recipe calls for (beta.6, docs/dev/design/base-recipes.md section 9)
  A Base recipe's Steps are part of the cooking timeline, labelled with its name, and end before the Step that uses it. A
  jar in the Pantry that covers the Base recipe hides its Steps. Béchamel yields 1000 g; Lasagne calls for 500 g of it, one
  Batch, planned in the Main Course of Monday 2026-11-09's Dinner at 19:00 (C2 household, UTC). Béchamel: "Melt the butter"
  (5 min Active), then "Simmer the sauce" (20 min Passive). Lasagne: "Layer the lasagne" (10 min Active), then "Bake"
  (30 min Passive). Béchamel's block goes before "Layer the lasagne", so everything takes 65 minutes.

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
    And the C2 plan is empty
    And the C2 plan has "Lasagne" in the Course "Main" on 2026-11-09 as planned

  Scenario: Béchamel's Steps are labelled and end before "Layer the lasagne"
    When I open the cooking timeline of 2026-11-09
    Then the response status is 200
    And the timeline takes 65 minutes and starts at 17:55 UTC
    And the timeline lists 4 items
    And timeline item 1 is "Melt the butter" labelled "Béchamel"
    And timeline item 2 is "Simmer the sauce" labelled "Béchamel"
    And timeline item 3 is "Layer the lasagne" and carries no Base recipe label
    And timeline item 4 is "Bake" and carries no Base recipe label
    And timeline item 2 ends before timeline item 3 starts
    And Cook Mode marks no Base recipe as covered by Stock

  Scenario: A full jar hides Béchamel's Steps
    Given the BR-G Stock holds 500 g of "Béchamel"
    When I open the cooking timeline of 2026-11-09
    Then the timeline takes 40 minutes and starts at 18:20 UTC
    And the timeline lists 2 items
    And timeline item 1 is "Layer the lasagne" and carries no Base recipe label
    And timeline item 2 is "Bake" and carries no Base recipe label
    And Cook Mode marks "Béchamel" as covered by Stock

  Scenario: A jar that covers only part of it leaves the Steps in
    Given the BR-G Stock holds 300 g of "Béchamel"
    When I open the cooking timeline of 2026-11-09
    Then the timeline takes 65 minutes and starts at 17:55 UTC
    And the timeline lists 4 items
    And Cook Mode marks no Base recipe as covered by Stock

  Scenario: A timer works on a Base recipe's Passive Step
    When I open the cooking timeline of 2026-11-09
    And I start the timer of timeline item 2
    Then the response status is 201
    And the started Cook timer is labelled "Béchamel: Simmer the sauce" for 1200 seconds

  Scenario: The Course's own Cook view labels the Steps too
    When I open Cook Mode for the Course "Main" on 2026-11-09
    Then the response status is 200
    And the Cook Mode view lists 4 Steps
    And Cook Mode view Step 1 is "Melt the butter" labelled "Béchamel"
    And Cook Mode view Step 3 is "Layer the lasagne" labelled ""
