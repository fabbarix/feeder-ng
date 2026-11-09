Feature: Recipe images
  Uploaded photos are re-encoded to WebP with the longest side at most 1600 px
  and served only to signed-in Users.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: A large photo is shrunk to 1600 px on the longest side
    When I upload a 3200x1600 PNG as a Recipe image
    Then the response status is 201
    And the Recipe JSON "width" is "1600"
    And the Recipe JSON "height" is "800"
    When I fetch the uploaded image
    Then the response status is 200
    And the fetched image is a WebP of 1600x800

  Scenario: A small photo is not enlarged
    When I upload a 800x600 PNG as a Recipe image
    And I fetch the uploaded image
    Then the fetched image is a WebP of 800x600

  Scenario: Images are only served to signed-in Users
    Given I upload a 100x100 PNG as a Recipe image
    When I fetch the uploaded image without signing in
    Then the response status is 401

  Scenario: Something that is not an image is refused
    When I upload the text "<svg onload=alert(1)>" as a Recipe image
    Then the response status is 422
    And the error code is "unsupported_image"

  Scenario: Photos over 8 MB are refused
    When I upload a Recipe image of 9 MB
    Then the response status is 413
    And the error code is "image_too_large"

  Scenario: A tiny file that declares enormous dimensions is refused without decoding it
    When I upload a tiny PNG declaring 30000x30000 pixels as a Recipe image
    Then the response status is 422
    And the error code is "image_too_large_pixels"

  Scenario: A very long image is refused even when its pixel count is small
    When I upload a tiny PNG declaring 12001x10 pixels as a Recipe image
    Then the response status is 422
    And the error code is "image_too_large_pixels"

  Scenario: The declared type must match the actual format
    When I upload a 100x100 PNG declared as "image/jpeg" as a Recipe image
    Then the response status is 422
    And the error code is "unsupported_image"

  Scenario: GIF is not an accepted format
    When I upload a 20x20 GIF as a Recipe image
    Then the response status is 422
    And the error code is "unsupported_image"

  Scenario: A Recipe and its Steps can carry uploaded images
    Given the Ingredient "flour" exists with Base Unit "g"
    And I upload a 400x300 PNG as a Recipe image
    When I create a Recipe with JSON:
      """
      {
        "name": "Photo pie", "yield": 4, "image": "<image:last>",
        "lines": [{"ingredientId": <id:flour>, "quantity": 1, "unit": "g"}],
        "steps": [{"text": "Bake", "kind": "passive", "durationMinutes": 30, "image": "<image:last>"}]
      }
      """
    Then the response status is 201
    And the Recipe JSON "imageUrl" is "/api/images/<image:last>"
    And the Recipe JSON "steps.0.imageUrl" is "/api/images/<image:last>"

  Scenario: A Recipe cannot point at an image that does not exist
    Given the Ingredient "flour" exists with Base Unit "g"
    When I create a Recipe with JSON:
      """
      {
        "name": "Ghost photo", "yield": 4, "image": "0123456789abcdef0123456789abcdef",
        "lines": [{"ingredientId": <id:flour>, "quantity": 1, "unit": "g"}]
      }
      """
    Then the response status is 422
    And the Recipe JSON "error.field" is "image"
