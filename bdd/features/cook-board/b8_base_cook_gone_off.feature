@br-g @b8-base
Feature: Cook Mode ignores a jar that has gone off by the meal date (beta.8, docs/dev/design/b8-base.md section 2)
  The Shopping List draws only Stock Lots that have not gone off by the meal's date, so a gone-off jar of Béchamel does not
  cover the Lasagne and the list asks you to buy for it. Cook Mode counts Stock the same way: a jar that has gone off does
  not hide Béchamel's Steps. Béchamel yields 1000 g; Lasagne calls for 500 g, one Batch, planned for Monday 2026-11-09
  (the clock reads 2026-11-09 12:00 UTC). Cooked is not changed by this: it still uses up a gone-off Lot.

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

  Scenario: A jar that went off the day before leaves Béchamel's Steps in
    Given the BR-G Stock holds 500 g of "Béchamel" that goes off on 2026-11-08
    When I open the cooking timeline of 2026-11-09
    Then the timeline takes 65 minutes and starts at 17:55 UTC
    And the timeline lists 4 items
    And Cook Mode marks no Base recipe as covered by Stock

  Scenario: A jar that goes off on the meal date still hides them
    Given the BR-G Stock holds 500 g of "Béchamel" that goes off on 2026-11-09
    When I open the cooking timeline of 2026-11-09
    Then the timeline takes 40 minutes and starts at 18:20 UTC
    And the timeline lists 2 items
    And Cook Mode marks "Béchamel" as covered by Stock

  Scenario: Only the good jar counts when two are in the Pantry
    Given the BR-G Stock holds 500 g of "Béchamel" that goes off on 2026-11-08
    And the BR-G Stock holds 300 g of "Béchamel" that goes off on 2026-11-20
    When I open the cooking timeline of 2026-11-09
    Then the timeline takes 65 minutes and starts at 17:55 UTC
    And Cook Mode marks no Base recipe as covered by Stock
