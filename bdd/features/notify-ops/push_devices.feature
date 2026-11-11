Feature: Push devices
  Each User opts in per device and per notification type (spec §12). The Feeder
  generates its own VAPID keys on first start, so no Google setup is needed.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: The Feeder offers its VAPID public key
    When I ask for the push configuration
    Then the response status is 200
    And the push configuration has a VAPID public key
    And the push configuration lists 7 notification types

  Scenario: The VAPID public key survives a restart
    Given I note the VAPID public key
    When the Feeder restarts
    And I ask for the push configuration
    Then the VAPID public key is unchanged

  Scenario: A new device has every notification type off
    When I register the push device "Pixel" at "https://push.example.test/pixel"
    Then the response status is 201
    And my push devices are:
      | label | advanceStep | startCooking | confirmCooked | leftoverUseBy | stockSpoil | timerFinished |
      | Pixel | off         | off          | off           | off           | off        | off           |

  Scenario: A device can register with some types already on
    When I register the push device "Pixel" at "https://push.example.test/pixel" with "advanceStep, timerFinished" on
    Then my push devices are:
      | label | advanceStep | startCooking | confirmCooked | leftoverUseBy | stockSpoil | timerFinished |
      | Pixel | on          | off          | off           | off           | off        | on            |

  Scenario: Types are switched on and off per device
    Given I registered the push device "Pixel" at "https://push.example.test/pixel"
    And I registered the push device "Tablet" at "https://push.example.test/tablet"
    When I switch "stockSpoil" on for the push device "Tablet"
    And I switch "confirmCooked" on for the push device "Pixel"
    And I switch "confirmCooked" off for the push device "Pixel"
    Then my push devices are:
      | label  | advanceStep | startCooking | confirmCooked | leftoverUseBy | stockSpoil | timerFinished |
      | Pixel  | off         | off          | off           | off           | off        | off           |
      | Tablet | off         | off          | off           | off           | on         | off           |

  Scenario: Registering the same browser again updates its device
    Given I registered the push device "Pixel" at "https://push.example.test/pixel"
    When I register the push device "Pixel 2" at "https://push.example.test/pixel" with "leftoverUseBy" on
    Then the response status is 200
    And my push devices are:
      | label   | advanceStep | startCooking | confirmCooked | leftoverUseBy | stockSpoil | timerFinished |
      | Pixel 2 | off         | off          | off           | on            | off        | off           |

  Scenario: Removing a device
    Given I registered the push device "Pixel" at "https://push.example.test/pixel"
    When I remove the push device "Pixel"
    Then the response status is 204
    And I have no push devices

  Scenario: The device list never reveals the endpoint or keys
    Given I registered the push device "Pixel" at "https://push.example.test/pixel"
    When I list my push devices
    Then the response body does not contain "push.example.test"

  Scenario: Another User cannot see or change my device
    Given I registered the push device "Pixel" at "https://push.example.test/pixel"
    When I am signed in as the Admin
    And I switch "advanceStep" on for the push device "Pixel" owned by "user@example.test"
    Then the response status is 404
    And the push device "Pixel" still belongs to "user@example.test"
    When I remove the push device "Pixel" owned by "user@example.test"
    Then the response status is 404

  Scenario Outline: Unsafe or malformed endpoints are refused
    When I register the push device "Bad" at "<endpoint>"
    Then the response status is 422
    And the error code is "validation_failed"

    Examples:
      | endpoint                          |
      | http://push.example.test/plain    |
      | https://localhost/push            |
      | https://127.0.0.1/push            |
      | https://10.0.0.5/push             |
      | https://169.254.169.254/latest    |
      | not a url                         |

  Scenario: Malformed keys are refused
    When I register the push device "Bad" at "https://push.example.test/bad" with broken keys
    Then the response status is 422
    And the error code is "validation_failed"

  Scenario: An unknown notification type is refused
    Given I registered the push device "Pixel" at "https://push.example.test/pixel"
    When I switch "newsletter" on for the push device "Pixel"
    Then the response status is 422
    And the error code is "validation_failed"

  Scenario: Push needs a signed-in User
    Given I am not signed in
    When I GET "/api/notifications/devices"
    Then the response status is 401
    When I GET "/api/notifications/config"
    Then the response status is 401
