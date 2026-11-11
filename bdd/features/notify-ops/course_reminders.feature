Feature: Reminders for a dinner with several Courses
  Advance Step reminders are per Course. Start cooking and Confirm Cooked are one reminder per Meal Slot:
  Start cooking falls at the start of the slot's cooking timeline, Confirm Cooked 2 hours after the slot time.

  Background:
    Given a running Feeder
    And the push service is a recording stand-in
    And I am signed in as the Admin
    And the household is in "Europe/Rome" with quiet hours from 22:00 to 07:00

  Scenario: One Start cooking for the whole slot, at the start of its timeline
    Given the phone is registered for push with "startCooking" on
    And dinner "Chicken curry" is planned for 19:30 today taking 45 minutes in total
    And the dinner "Chicken curry" also has the Course "Tomato soup" taking 10 minutes
    When it is 18:34 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 18:35 and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Start cooking now for 19:30: Tomato soup first"
    When it is 18:45 and the Feeder checks for due notifications
    Then 1 push has been sent in total

  Scenario: One Confirm Cooked for the whole slot, naming the Recipes
    Given the phone is registered for push with "confirmCooked" on
    And dinner "Chicken curry" is planned for 19:30 today taking 45 minutes in total
    And the dinner "Chicken curry" also has the Course "Tomato soup" taking 10 minutes
    When it is 21:30 and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Did you cook Chicken curry and Tomato soup?"
    When it is 21:31 and the Feeder checks for due notifications
    Then 1 push has been sent in total

  Scenario: Each Course has its own Advance Step reminder
    Given the phone is registered for push with "advanceStep" on
    And dinner "Chicken curry" is planned for 19:30 today with the Advance Step "Marinate the chicken" 4 hours ahead
    And the dinner "Chicken curry" also has the Course "Roast" with the Advance Step "Brine the roast" 4 hours ahead
    When it is 15:30 and the Feeder checks for due notifications
    Then 2 pushes have been sent
