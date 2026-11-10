Feature: Reading a recipe from photos
  One to four photos (data URLs or https addresses) of a cookbook page or a handwritten card. The photos that were
  read can be kept as the Recipe photo, only if the User chooses one in Import Review.

  Background:
    Given a running Feeder with a secret key
    And a fake Anthropic server
    And the Recipe Assistant is on with the fake server and the API key "sk-ant-api03-PHOTO0001"
    And I am signed in as the User

  Scenario: Two photos reach the model before the text, as JPEG within 2,576 px
    When I read 2 photos
    Then the read is done and a review is open
    And the model received 2 JPEG image blocks before the text, each at most 2576 px
    And the read result has no images

  Scenario: Five photos are refused
    When I start a read of 5 photos
    Then the response status is 422
    And the error code is "too_many_photos"
    And the model was called 0 times

  Scenario: A 9 MB photo is refused
    When I start a read of a 9 MB photo
    Then the response status is 422
    And the error code is "photo_too_large"

  Scenario: A photo address on a private network is not fetched
    When I read the photo address "https://127.0.0.1:9/card.jpg"
    Then the read failed with "photo_unavailable"
    And the model was called 0 times

  Scenario: Confirm without choosing a photo stores no image and the candidates are gone
    When I read 2 photos
    And I confirm the review
    Then 2 Recipes exist
    And no Recipe has an image or a source address
    And the review's photo 1 answers 404

  Scenario: Confirm with photo 2 for Recipe 1 stores one WebP image on Recipe 1
    When I read 2 photos
    And I confirm the review choosing photo 2 for Recipe 1
    Then Recipe 1 has one WebP image and Recipe 2 has none

  Scenario: Closing the review drops the candidate photos
    When I read 2 photos
    Then the review's photo 1 answers 200
    When I close the review
    Then the review's photo 1 answers 404

  Scenario: Another User cannot see the candidate photos
    When I read 2 photos
    And "second@example.test" is on the allowlist
    And I am signed in as "second@example.test"
    Then the review's photo 1 answers 404

  Scenario: A User at the hourly limit sending a 40 MB photo body gets 429 without the body being read
    Given I have read 30 recipes
    When I send a 40 MB photo request body
    Then the response status is 429
    And less than half of the body was consumed
