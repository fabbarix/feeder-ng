@b9
Feature: Advance Steps due in the next 24 hours
  Today lists every Advance Step that is not done and due within the next 24 hours, from the same source as the
  board and the push, so a Step done on the board leaves Today. Today is Monday 2026-11-09, 12:00 UTC.

  Background:
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Admin adds the Meal Slot "Dinner" on Tuesday at 19:00 without naming who attends
    And the Recipe "Beef stew" has an Advance Step "Take the beef out of the freezer" 24 hours ahead and is planned on 2026-11-10 in the Meal Slot "Dinner" on Tuesday
    And I am signed in as the User

  Scenario: Tomorrow's Advance Step is due tonight and is listed today
    When I GET "/api/today/advance-steps"
    Then the Advance Steps due list has 1 step

  Scenario: Marking the Step done takes it off Today
    When I GET "/api/today/advance-steps"
    And I mark the first due Advance Step done
    And I GET "/api/today/advance-steps"
    Then the Advance Steps due list has 0 steps
