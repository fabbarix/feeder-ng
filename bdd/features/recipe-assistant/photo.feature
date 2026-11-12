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

  Scenario: Four photos are read
    When I read 4 photos
    Then the read is done and a review is open
    And the model received 4 JPEG image blocks before the text, each at most 2576 px

  Scenario: Photos reach the model in the order they were sent
    When I read photos of 300x200, 200x300 and 400x100 px
    Then the model received image blocks of 300x200, 200x300 and 400x100 px, in that order

  Scenario: A cropped photo of an odd size is read as it is
    When I read photos of 713x377 px
    Then the read is done and a review is open
    And the model received image blocks of 713x377 px, in that order

  Scenario: A photo turned to portrait is read as it is
    When I read photos of 377x713 px
    Then the read is done and a review is open
    And the model received image blocks of 377x713 px, in that order

  Scenario: A large photo is shrunk to 2576 px on its long side with its shape kept
    When I read photos of 4000x1000 px
    Then the model received image blocks of 2576x644 px, in that order

  Scenario: A HEIC photo is read as JPEG
    When I read the HEIC photo "pantry-128x96.heic"
    Then the read is done and a review is open
    And the model received 1 JPEG image blocks before the text, each at most 2576 px

  Scenario: A HEIC photo declared as HEIF is read as JPEG
    When I read the photo "pantry-128x96.heic" declared as "image/heif"
    Then the read is done and a review is open
    And the model received 1 JPEG image blocks before the text, each at most 2576 px

  Scenario: A sideways photo reaches the model upright
    When I read the photo "sideways-6.jpg"
    Then the read is done and a review is open
    And the model received image blocks of 32x64 px, in that order

  Scenario: A HEIC photo that is far too wide is refused
    When I start a read of the photo "too-wide-12100x64.heic" declared as "image/heic"
    Then the read failed with "photo_too_large"
    And the model was called 0 times

  Scenario: A photo whose declared type differs from its bytes is refused
    When I start a read of the photo "sideways-6.jpg" declared as "image/png"
    Then the read failed with "photo_unsupported"

  Scenario: A text file sent as a photo is refused
    When I start a read of a photo of text declared as "image/jpeg"
    Then the read failed with "photo_unsupported"
    And the model was called 0 times

  Scenario: A photo with both a data URL and a link is refused
    When I start a read of a photo that is both a data URL and a link
    Then the response status is 400
    And the error code is "bad_request"

  Scenario: No photos are refused
    When I start a read of no photos
    Then the response status is 422
    And the error code is "photos_empty"
    And the model was called 0 times

  Scenario: A pasted https photo link is fetched and read
    Given a photo link "/card.jpg" of 640x480 px
    When I read the photo link "/card.jpg"
    Then the read is done and a review is open
    And the model received image blocks of 640x480 px, in that order

  Scenario: Photos and a link are read in the order they were sent
    Given a photo link "/card.jpg" of 640x480 px
    When I read a photo of 300x200 px, then the photo link "/card.jpg", then a photo of 200x300 px
    Then the model received image blocks of 300x200, 640x480 and 200x300 px, in that order

  Scenario: A photo link to a 9 MB picture is refused
    Given a photo link "/big.jpg" of 9 MB
    When I start a read of the photo link "/big.jpg"
    Then the read failed with "photo_too_large"
    And the model was called 0 times

  Scenario: A photo link that is not a picture is refused
    Given a photo link "/note.jpg" that holds text
    When I start a read of the photo link "/note.jpg"
    Then the read failed with "photo_unsupported"
    And the model was called 0 times

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
