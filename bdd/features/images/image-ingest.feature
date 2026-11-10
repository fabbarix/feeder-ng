Feature: Adding an image from a link, and cleaning up images that were never saved
  Every image field (Recipe photos, Step photos, later Ingredient images) takes its picture from one place on
  the server. Pasting a link makes Feeder download the picture itself, with the same limits and WebP
  conversion as the Recipe File, and never from a private address. A picture added in an editor but never
  saved is removed by the nightly clean-up, so /data does not fill with orphans.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Ingredient "flour" exists with Base Unit "g"

  Scenario: A pasted link is downloaded, shrunk and stored as WebP
    Given a web server serves a 3000x2000 PNG at "https://photos.example/soup.png"
    When I add the image from the link "https://photos.example/soup.png"
    Then the response status is 201
    When I fetch the uploaded image
    Then the fetched image is a WebP of 1600x1067

  Scenario Outline: Links that Feeder will not download
    When I add the image from the link "<link>"
    Then the response status is <status>
    And the error code is "<code>"

    Examples:
      | link                                       | status | code                 |
      | http://photos.example/soup.png             | 422    | image_url_invalid    |
      | https://user:secret@photos.example/a.png   | 422    | image_url_invalid    |
      | https://127.0.0.1/soup.png                 | 422    | image_url_blocked    |
      | https://10.0.0.5/soup.png                  | 422    | image_url_blocked    |
      | https://192.168.1.20/soup.png              | 422    | image_url_blocked    |
      | https://169.254.169.254/latest/meta-data/  | 422    | image_url_blocked    |
      | https://[::1]/soup.png                     | 422    | image_url_blocked    |

  Scenario: A link to something that is not a picture, or is too big, is refused
    Given a web server serves the text "<html>hello</html>" as an image at "https://photos.example/page.png"
    When I add the image from the link "https://photos.example/page.png"
    Then the response status is 422
    And the error code is "unsupported_image"
    Given a web server serves a 9 MB image at "https://photos.example/huge.png"
    When I add the image from the link "https://photos.example/huge.png"
    Then the response status is 413
    And the error code is "image_too_large"

  Scenario: A picture that was never saved is removed by the nightly clean-up
    When I add a 40x30 PNG image named "forgotten"
    And I add a 40x30 PNG image named "cover"
    And I save the Recipe "Soup" with the image "cover"
    And 49 hours pass
    And I add a 40x30 PNG image named "fresh"
    And the scheduler runs its due jobs
    Then the image "forgotten" is gone
    And the image "cover" is still there
    And the image "fresh" is still there

  Scenario: Removing a picture in the editor discards it at once, unless a Recipe uses it
    When I add a 40x30 PNG image named "draft"
    And I discard the image "draft"
    Then the response status is 204
    And the image "draft" is gone
    When I add a 40x30 PNG image named "cover"
    And I save the Recipe "Soup" with the image "cover"
    And I discard the image "cover"
    Then the response status is 409
    And the error code is "image_in_use"
    And the image "cover" is still there
