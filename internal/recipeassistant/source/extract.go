// Package source extracts what the Recipe Assistant reads from a fetched web
// page: readable text, schema.org Recipe JSON-LD nodes, image URLs. Pure
// (golang.org/x/net/html, no network). See design §3.2.
//
// STUB.
package source

import "encoding/json"

// MaxImages is the most image URLs returned.
const MaxImages = 20

// Page is the extraction result. Nothing is truncated here (the caller applies
// the 60,000 / 30,000 character rules).
type Page struct {
	Title        string
	Text         string
	Recipes      []json.RawMessage // schema.org Recipe nodes, cooking fields only
	ImageURLs    []string          // absolute https URLs, de-duplicated, at most MaxImages
	CanonicalURL string            // <link rel=canonical>, absolutised; "" when absent
}

// Extract reads an HTML document (already UTF-8) fetched from finalURL.
// It never panics, whatever the input.
func Extract(body []byte, finalURL string) Page { return Page{} }

// IsComplete reports whether a Recipe node has non-empty recipeIngredient and
// recipeInstructions.
func IsComplete(node json.RawMessage) bool { return false }
