Feature: Push delivery
  Due notifications go to every device opted in to that type, once each. Quiet
  hours (22:00 to 07:00 here) hold them back until the window ends, except
  Timer finished. The push service is replaced by a recording stand-in.

  Background:
    Given a running Feeder
    And the push service is a recording stand-in
    And I am signed in as the Admin
    And the household is in "Europe/Rome" with quiet hours from 22:00 to 07:00

  Scenario: Advance Step due is pushed once, at slot time minus lead time
    Given the phone is registered for push with "advanceStep" on
    And dinner "Chicken curry" is planned for 19:30 today with the Advance Step "Marinate the chicken" 4 hours ahead
    When it is 15:29 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 15:30 and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Marinate the chicken now for 19:30"
    When it is 15:31 and the Feeder checks for due notifications
    Then 1 push has been sent in total

  Scenario: A notification only reaches devices opted in to its type
    Given the phone is registered for push with "advanceStep" on
    And the tablet is registered for push with "leftoverUseBy" on
    And dinner "Chicken curry" is planned for 19:30 today with the Advance Step "Marinate the chicken" 4 hours ahead
    When it is 15:30 and the Feeder checks for due notifications
    Then 1 push has been sent in total
    And the tablet has received 0 pushes

  Scenario: Every opted-in device gets its own copy
    Given the phone is registered for push with "startCooking" on
    And the tablet is registered for push with "startCooking" on
    And dinner "Chicken curry" is planned for 19:30 today taking 45 minutes in total
    When it is 18:45 and the Feeder checks for due notifications
    Then the phone has received 1 push
    And the tablet has received 1 push

  Scenario: Confirm Cooked comes 2 hours after the slot time while unconfirmed
    Given the phone is registered for push with "confirmCooked" on
    And dinner "Chicken curry" is planned for 19:30 today taking 45 minutes in total
    When it is 21:29 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 21:30 and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Did you cook Chicken curry?"

  Scenario: A meal that was already cooked is not reminded about
    Given the phone is registered for push with "confirmCooked" on
    And dinner "Chicken curry" is planned for 19:30 today taking 45 minutes in total
    And dinner "Chicken curry" has been cooked
    When it is 21:30 and the Feeder checks for due notifications
    Then 0 pushes have been sent

  Scenario: Quiet hours hold a notification until the window ends
    Given the phone is registered for push with "confirmCooked" on
    And dinner "Late supper" is planned for 21:30 today taking 30 minutes in total
    When it is 23:45 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 06:59 tomorrow and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 07:00 tomorrow and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Did you cook Late supper?"

  Scenario: Quiet hours follow the household time zone
    Given the household is in "Asia/Tokyo" with quiet hours from 22:00 to 07:00
    And the phone is registered for push with "leftoverUseBy" on
    And a Leftover "Soup" with 2 portions has its Use-by tomorrow
    # 10:00 Tokyo tomorrow is 01:00 UTC; it is outside quiet hours there
    When it is 10:00 tomorrow and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Use up the Soup (2 portions) today"

  Scenario: Leftover Use-by is pushed at 10:00 on the Use-by date
    Given the phone is registered for push with "leftoverUseBy" on
    And a Leftover "Soup" with 2 portions has its Use-by tomorrow
    When it is 09:59 tomorrow and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When it is 10:00 tomorrow and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Use up the Soup (2 portions) today"

  Scenario: Stock about to spoil is pushed on the go-off date, unless a plan uses it
    Given the phone is registered for push with "stockSpoil" on
    And a Stock Lot of "Spinach" goes off in 1 day and no plan uses it
    And a Stock Lot of "Milk" goes off in 1 day and a plan uses it
    When it is 10:00 tomorrow and the Feeder checks for due notifications
    Then 1 push has been sent to the phone saying "Spinach is good until today and no Planned Meal uses it"

  Scenario: Timer finished is pushed at once, even during quiet hours
    Given the phone is registered for push with "timerFinished" on
    When it is 23:00 and the timer "Pasta" for "Carbonara" finishes
    Then within a moment 1 push has been sent to the phone saying "Pasta (Carbonara)"

  Scenario: Timer finished only reaches devices opted in to it
    Given the phone is registered for push with "timerFinished" on
    And the tablet is registered for push with "advanceStep" on
    When it is 12:00 and the timer "Pasta" for "Carbonara" finishes
    Then within a moment 1 push has been sent in total
    And the tablet has received 0 pushes

  Scenario: A device the push service has forgotten is removed
    Given the phone is registered for push with "advanceStep" on
    And the push service has forgotten the phone
    And dinner "Chicken curry" is planned for 19:30 today with the Advance Step "Marinate the chicken" 4 hours ahead
    When it is 15:30 and the Feeder checks for due notifications
    Then I have no push devices

  Scenario: A push that failed is tried again on the next check
    Given the phone is registered for push with "advanceStep" on
    And the push service is failing
    And dinner "Chicken curry" is planned for 19:30 today with the Advance Step "Marinate the chicken" 4 hours ahead
    When it is 15:30 and the Feeder checks for due notifications
    Then 0 pushes have been sent
    When the push service recovers
    And it is 15:31 and the Feeder checks for due notifications
    Then 1 push has been sent in total

  Scenario: A check that comes late still sends a reminder less than 6 hours old
    Given the phone is registered for push with "advanceStep" on
    And dinner "Chicken curry" is planned for 19:30 today with the Advance Step "Marinate the chicken" 4 hours ahead
    When it is 17:00 and the Feeder checks for due notifications
    Then 1 push has been sent in total

  Scenario: A Feeder that was down does not replay stale reminders
    Given the phone is registered for push with "advanceStep" on
    And dinner "Chicken curry" is planned for 19:30 today with the Advance Step "Marinate the chicken" 4 hours ahead
    When it is 21:31 and the Feeder checks for due notifications
    Then 0 pushes have been sent
