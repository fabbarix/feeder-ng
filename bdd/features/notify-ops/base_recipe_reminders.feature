@br-g
Feature: Start cooking counts the time of the Base recipes (beta.6, docs/dev/design/base-recipes.md section 9)
  The Start cooking reminder falls at the slot time minus the cooking timeline, which now includes the Steps of the Base
  recipes a Recipe calls for; a jar that covers one takes its time out again. The Advance Steps of a Base recipe get their
  own reminders. The facts are the Feeder's own Planned Meals and Recipes. Dinner is at 19:00 Rome time on Monday
  2026-11-09: "Layer the lasagne" 10 min and "Bake" 30 min take 40 minutes on their own, 65 with Béchamel's 25.

  Background:
    Given a running Feeder
    And the push service records the pushes of the real Planned Meals
    And I am signed in as the Admin
    And the household is in "Europe/Rome" with quiet hours from 22:00 to 07:00
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the BR-G Base recipe "Béchamel" yields 1000 g, needs "800 g milk, 100 g butter, 100 g flour" and has these Steps:
      """
      [{"text": "Chill the milk", "kind": "advance", "leadTimeMinutes": 360},
       {"text": "Melt the butter", "kind": "active", "durationMinutes": 5},
       {"text": "Simmer the sauce", "kind": "passive", "durationMinutes": 20, "after": [1]}]
      """
    And the BR-G Recipe "Lasagne" for the Course "Main" yields 4, needs "200 g pasta, 500 g Béchamel" and has these Steps:
      """
      [{"text": "Layer the lasagne", "kind": "active", "durationMinutes": 10},
       {"text": "Bake", "kind": "passive", "durationMinutes": 30, "after": [0]}]
      """
    And the C2 plan is empty
    And the C2 plan has "Lasagne" in the Course "Main" on 2026-11-09 as planned

  Scenario: Start cooking comes 25 minutes earlier for Béchamel
    Given the phone is registered for push with "startCooking" on
    When it is 17:54 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 17:55 and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Start cooking Lasagne now to eat at 19:00"

  Scenario: A jar of Béchamel takes its 25 minutes out again
    Given the phone is registered for push with "startCooking" on
    And the BR-G Stock holds 500 g of "Béchamel"
    When it is 18:19 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 18:20 and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Start cooking Lasagne now to eat at 19:00"

  Scenario: Béchamel's Advance Step gets its own reminder
    Given the phone is registered for push with "advanceStep" on
    When it is 12:59 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 13:00 and the Feeder checks for due notifications
    Then 1 push has been sent in total
