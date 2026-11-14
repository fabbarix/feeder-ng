@br-g @b8-base
Feature: Start cooking counts a gone-off jar like Cook Mode (beta.8, docs/dev/design/b8-base.md section 2)
  The notification facts apply Stock like Cook Mode, and Cook Mode ignores a Lot that has gone off by the meal date. Dinner
  is at 19:00 Rome time on Monday 2026-11-09: 40 minutes for the Lasagne alone, 65 with Béchamel's 25.

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
    And the C2 plan is empty
    And the C2 plan has "Lasagne" in the Course "Main" on 2026-11-09 as planned

  Scenario: A gone-off jar of Béchamel does not take its 25 minutes out
    Given the phone is registered for push with "startCooking" on
    And the BR-G Stock holds 500 g of "Béchamel" that goes off on 2026-11-08
    When it is 17:54 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 17:55 and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Start cooking Lasagne now to eat at 19:00"
