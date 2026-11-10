Feature: Access Requests
  Not everyone with a Google account can sign in. A person signs in straight
  away if their address was added to the Household (on the allowlist, or as a
  Member's email). Anyone else with a verified Google email creates an Access
  Request and waits; any signed-in User can approve or deny it.

  Background:
    Given a Feeder that asks new Google visitors for approval

  Scenario: An address added to the allowlist signs in straight away
    Given "nonna@example.test" is on the allowlist
    When the visitor "nonna@example.test" signs in with Google as "Nonna"
    Then the sign-in redirect goes to "/"
    And I have a Feeder session
    And there are 0 pending Access Requests

  Scenario: A Member's email signs in straight away and is linked to the Member
    Given the Household has a Member "Nonna" with the email "nonna@example.test"
    When the visitor "nonna@example.test" signs in with Google as "Nonna Rossi"
    Then the sign-in redirect goes to "/"
    And I have a Feeder session
    And "nonna@example.test" is now a User
    And the Member "Nonna" is linked to the User "nonna@example.test"
    And there are 0 pending Access Requests

  Scenario: An unknown verified Google account waits for approval
    When the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    Then the sign-in redirect goes to "/waiting-for-approval"
    And I have no Feeder session
    And there is a pending Access Request from "zia@example.test" named "Zia Rosa"
    And "zia@example.test" is not a User

  Scenario: An unverified Google email is refused without a request
    When the visitor "zia@example.test" signs in with Google but Google has not verified the address
    Then the sign-in redirect goes to "/not-invited"
    And I have no Feeder session
    And there are 0 pending Access Requests

  Scenario: Signing in again does not duplicate the request
    When the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    And the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    And the visitor "ZIA@example.test" signs in with Google as "Zia Rosa"
    Then there are 1 pending Access Requests

  Scenario: A waiting visitor sees only their own Google details
    Given "nonna@example.test" is on the allowlist
    When the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    And the visitor "zia@example.test" opens the waiting page
    Then the response status is 200
    And the response JSON field "status" is "pending"
    And the response JSON field "email" is "zia@example.test"
    And the response does not mention "nonna@example.test"
    And the response does not mention "admin@example.test"

  Scenario Outline: A waiting visitor gets no household data
    When the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    And the visitor "zia@example.test" requests "<path>"
    Then the response status is 401

    Examples:
      | path                 |
      | /api/me              |
      | /api/members         |
      | /api/meal-slots      |
      | /api/allowlist       |
      | /api/access-requests |
      | /api/events          |

  Scenario: Another User approves and the person can sign in
    Given "nonna@example.test" is on the allowlist
    And the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    When the User "nonna@example.test" approves the Access Request from "zia@example.test"
    Then the response status is 200
    And "zia@example.test" is now a User
    And there are 0 pending Access Requests
    When the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    Then the sign-in redirect goes to "/"
    And I have a Feeder session

  Scenario: Approving needs no Admin role and adds a plain User
    Given "nonna@example.test" is on the allowlist
    And the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    When the User "nonna@example.test" approves the Access Request from "zia@example.test"
    Then the response JSON field "isAdmin" is false

  Scenario: Denying removes the request and the person can ask again later
    Given the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    When the User "user@example.test" denies the Access Request from "zia@example.test"
    Then the response status is 204
    And there are 0 pending Access Requests
    And "zia@example.test" is not a User
    When 2 hours pass
    And the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    Then the sign-in redirect goes to "/waiting-for-approval?state=limited"
    And there are 0 pending Access Requests
    When 1 days pass
    And the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    Then the sign-in redirect goes to "/waiting-for-approval"
    And there is a pending Access Request from "zia@example.test" named "Zia Rosa"

  Scenario: Approvals and denials are recorded
    Given the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    And the visitor "rex@example.test" signs in with Google as "Rex"
    When the User "user@example.test" approves the Access Request from "zia@example.test"
    And the Admin denies the Access Request from "rex@example.test"
    Then the access history shows that "user@example.test" approved "zia@example.test"
    And the access history shows that "admin@example.test" denied "rex@example.test"

  Scenario: One address cannot flood the queue
    When 10 different visitors sign in with Google
    Then there are 10 pending Access Requests
    When the visitor "one-more@example.test" signs in with Google as "Too Many"
    Then the sign-in redirect goes to "/waiting-for-approval?state=limited"
    And there are 10 pending Access Requests
    When 2 hours pass
    And the visitor "one-more@example.test" signs in with Google as "Too Many"
    Then the sign-in redirect goes to "/waiting-for-approval"

  Scenario: One address cannot keep asking after being denied again and again
    When the visitor "zia@example.test" is denied and asks again 3 times, a day apart
    And the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    Then the sign-in redirect goes to "/waiting-for-approval?state=limited"
    And there are 0 pending Access Requests

  Scenario: A pending request expires after 14 days
    Given the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    When 13 days pass
    Then there are 1 pending Access Requests
    When 2 days pass
    Then there are 0 pending Access Requests
    And the visitor "zia@example.test" opens the waiting page
    And the response JSON field "status" is "none"

  Scenario: Approve and deny refuse requests from another origin
    Given the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    When I approve the Access Request from "zia@example.test" as "user@example.test" from the origin "https://evil.example"
    Then the response status is 403
    And the error code is "cross_origin"
    When I deny the Access Request from "zia@example.test" as "user@example.test" from the origin "https://evil.example"
    Then the response status is 403
    And there are 1 pending Access Requests
    And "zia@example.test" is not a User

  Scenario: Approve and deny need a signed-in User
    Given the visitor "zia@example.test" signs in with Google as "Zia Rosa"
    When the visitor "zia@example.test" tries to approve their own Access Request
    Then the response status is 401
    And "zia@example.test" is not a User
