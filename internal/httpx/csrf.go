package httpx

import "net/http"

// CSRFGuard protects the state-changing /api routes. For POST, PUT, PATCH and
// DELETE requests under /api/ it answers:
//   - 415 "unsupported_media_type" when the request has a body whose Content-Type
//     is not application/json (parameters such as charset are allowed);
//   - 403 "cross_origin" when an Origin header is present and its origin
//     (scheme://host) differs from baseURL's origin, or, when baseURL is empty,
//     when its host differs from the request Host.
//
// Requests without an Origin header (non-browser clients), safe methods and
// paths outside /api/ pass through untouched.
//
// TODO(developer): implement; this stub lets the tests compile and fail.
func CSRFGuard(baseURL string, next http.Handler) http.Handler { return next }
