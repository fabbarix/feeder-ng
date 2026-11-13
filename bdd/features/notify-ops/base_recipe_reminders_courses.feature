@br-g
Feature: Start cooking counts the Base recipe of the Course that does not get the jar (beta.6, docs/dev/design/base-recipes.md section 9)
  Lasagne (Main) and Spinach bake (Side) each call for 500 g of Béchamel and the Pantry holds one jar of 600 g. The Main
  gets the jar; the Side makes its Béchamel, so the slot's timeline takes 55 minutes: Start cooking at 18:05 Rome time for a
  Dinner at 19:00. (Without the Side's Béchamel it would be 40 minutes, 18:20; with the Béchamel of both, 65, 17:55.)

  Background:
    Given a running Feeder
    And the push service records the pushes of the real Planned Meals
    And I am signed in as the Admin
    And the household is in "Europe/Rome" with quiet hours from 22:00 to 07:00
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

  Scenario: Start cooking takes the Side's Béchamel time into account
    Given the phone is registered for push with "startCooking" on
    When it is 18:04 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 18:05 and the Feeder checks for due notifications
    Then 1 push has been sent in total
