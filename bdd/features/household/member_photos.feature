Feature: Member photos
  A Member's avatar is a photo, an emoji or their initials, in that order of preference. The Admin picks
  one in the Member sheet; a photo is added with the shared image picker, which uploads it first, and the
  Member is saved with the image id.

  Background:
    Given a running Feeder
    And I am signed in as the Admin

  Scenario: The Admin gives a Member a photo
    When I add a 40x30 PNG image named "sam-face"
    And I add the Member "Sam" with the photo "sam-face"
    Then the response status is 201
    And the Member "Sam" shows the photo "sam-face"

  Scenario: A Member has no photo by default and the avatar falls back to the emoji or the initials
    When I add the Member "Anna" with no photo
    Then the Member "Anna" has no photo
    When I POST "/api/members" with JSON:
      """
      {"name": "Sam", "colour": "#e07a5f", "avatar": "🦊", "portionFactor": 0.5}
      """
    Then the response status is 201
    And the Member "Sam" has no photo

  Scenario: Replacing a Member's photo removes the old picture
    When I add a 40x30 PNG image named "old"
    And I add the Member "Sam" with the photo "old"
    And I add a 40x30 PNG image named "new"
    And I change the photo of the Member "Sam" to the image "new"
    Then the Member "Sam" shows the photo "new"
    And the image "old" is gone

  Scenario: Switching a Member to an emoji or initials removes the photo
    When I add a 40x30 PNG image named "sam-face"
    And I add the Member "Sam" with the photo "sam-face"
    And I change the Member "Sam" to have no photo
    Then the Member "Sam" has no photo
    And the image "sam-face" is gone

  Scenario: A photo that was never uploaded is refused
    When I add the Member "Sam" with the photo id "cccccccccccccccccccccccccccccccc"
    Then the response status is 422
    And the error code is "validation_failed"

  Scenario: The nightly clean-up keeps Member photos
    When I add a 40x30 PNG image named "forgotten"
    And I add a 40x30 PNG image named "sam-face"
    And I add the Member "Sam" with the photo "sam-face"
    And 49 hours pass
    And the scheduler runs its due jobs
    Then the image "forgotten" is gone
    And the image "sam-face" is still there

  Scenario: Removing a Member removes their photo
    When I add a 40x30 PNG image named "sam-face"
    And I add the Member "Sam" with the photo "sam-face"
    And the Admin deletes the Member "Sam"
    Then the image "sam-face" is gone
