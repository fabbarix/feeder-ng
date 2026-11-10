package recipeassistant

import "encoding/json"

// SourceKind is where the text came from.
type SourceKind string

// Source kinds.
const (
	KindPage  SourceKind = "page"
	KindText  SourceKind = "text"
	KindPhoto SourceKind = "photo"
)

// Addendum is appended to the Agent Prompt as the system prompt (design §4.4).
const Addendum = ""

// SystemPrompt is agentPrompt + a blank line + Addendum. Stable bytes: the
// same input always gives the same output (it carries the cache breakpoint).
func SystemPrompt(agentPrompt string) string { return "" }

// ValidateText trims pasted text and checks 1..MaxTextChars characters
// (runes): CodeTextEmpty, CodeTextTooLong.
func ValidateText(s string) (string, error) { return "", nil }

// Neutralise defuses closing tags of the wrapper elements (source, page_title,
// page_text, structured_data), any letter case, by turning "</name" into
// "<\/name", so untrusted content cannot end its own wrapper.
func Neutralise(s string) string { return "" }

// Source is an untrusted recipe source ready to be wrapped.
type Source struct {
	Kind           SourceKind
	URL            string            // page: the final URL
	Title          string            // page
	Text           string            // page text, or pasted text
	StructuredData []json.RawMessage // page: schema.org Recipe nodes
	PhotoCount     int               // photo
}

// BuildSourceText renders the text part of the user turn (design §4.4, §3.3):
//
//	text:  <source kind="text">\n{text}\n</source>
//	page:  <source kind="web page" url="...">, then <structured_data> (the
//	       nodes as a JSON array, capped at MaxJSONLDChars by dropping later
//	       nodes), <page_title>, <page_text>, then </source>
//	photo: <source kind="photo" count="N"> with a sentence saying the photos
//	       precede it, in page order, and are untrusted; no url
//
// Every piece of content goes through Neutralise; the url attribute is escaped
// so it cannot close the attribute or the tag. Page text over MaxPageTextChars
// characters is CodeSourceTooLong unless a kept node is complete (has both
// recipeIngredient and recipeInstructions), in which case <page_text> is left
// out. Page text is never truncated.
func BuildSourceText(s Source) (string, error) { return "", nil }
