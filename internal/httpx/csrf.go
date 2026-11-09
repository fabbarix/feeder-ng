package httpx

import (
	"mime"
	"net/http"
	"net/url"
	"strings"
)

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
func CSRFGuard(baseURL string, next http.Handler) http.Handler {
	base := parseOrigin(baseURL)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isStateChanging(r) {
			next.ServeHTTP(w, r)
			return
		}
		if r.ContentLength != 0 && !isJSON(r.Header.Get("Content-Type")) {
			WriteError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Requests with a body must be application/json")
			return
		}
		if origins := r.Header.Values("Origin"); len(origins) > 0 {
			if !sameOrigin(origins[0], base, baseURL, r.Host) {
				WriteError(w, http.StatusForbidden, "cross_origin", "Cross-origin requests are refused")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func isStateChanging(r *http.Request) bool {
	switch r.Method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
	default:
		return false
	}
	return strings.HasPrefix(r.URL.Path, "/api/")
}

func isJSON(contentType string) bool {
	mt, _, err := mime.ParseMediaType(contentType)
	return err == nil && mt == "application/json"
}

// parseOrigin returns the scheme and host of raw, or nil when raw is empty or
// unparsable. Only scheme and host take part in the comparison.
func parseOrigin(raw string) *url.URL {
	if raw == "" {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil
	}
	return &url.URL{Scheme: strings.ToLower(u.Scheme), Host: strings.ToLower(u.Host)}
}

// sameOrigin reports whether the Origin header value origin belongs to the
// Feeder: the base URL's origin when one is configured, otherwise the request
// Host. The literal "null" origin never matches.
func sameOrigin(origin string, base *url.URL, baseURL, requestHost string) bool {
	got := parseOrigin(origin)
	if got == nil {
		return false
	}
	if baseURL != "" {
		return base != nil && got.Scheme == base.Scheme && got.Host == base.Host
	}
	return got.Host == strings.ToLower(requestHost)
}
