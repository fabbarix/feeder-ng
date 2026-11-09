package recipefile

import (
	"errors"
	"fmt"
)

// MaxFileBytes is the largest Recipe File accepted (images are embedded).
const MaxFileBytes = 64 << 20

// Errors returned by Parse.
var (
	ErrTooLarge           = errors.New("recipe file too large")
	ErrSyntax             = errors.New("not valid JSON")
	ErrUnsupportedVersion = errors.New("unsupported recipe file version")
	ErrSchema             = errors.New("recipe file does not match the schema")
)

// SyntaxError is invalid JSON (Is ErrSyntax).
type SyntaxError struct{ Message string }

func (e *SyntaxError) Error() string        { return e.Message }
func (e *SyntaxError) Is(target error) bool { return target == ErrSyntax }

// VersionError is a "version" this importer does not know (Is
// ErrUnsupportedVersion). It is reported before any other schema error.
// Version holds the value found as JSON text (e.g. "2", "\"1\"").
type VersionError struct{ Version string }

func (e *VersionError) Error() string        { return fmt.Sprintf("unsupported version %s", e.Version) }
func (e *VersionError) Is(target error) bool { return target == ErrUnsupportedVersion }

// PathError is one schema violation. Path is the JSON path of the offending
// value, "$" for the root, e.g. "$.recipes[0].ingredients[1].quantity". For a
// missing required property the path is that of the parent object and the
// message names the property.
type PathError struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

// SchemaError lists every violation, ordered by path (Is ErrSchema).
type SchemaError struct{ Errors []PathError }

func (e *SchemaError) Error() string        { return fmt.Sprintf("%d schema errors", len(e.Errors)) }
func (e *SchemaError) Is(target error) bool { return target == ErrSchema }

// Parse decodes and validates a Recipe File against the embedded schema
// (docs/spec via the spec package; JSON Schema 2020-12 through
// github.com/santhosh-tekuri/jsonschema/v6). A leading UTF-8 BOM is ignored.
// Order: size (ErrTooLarge), syntax (*SyntaxError), version
// (*VersionError), schema (*SchemaError).
func Parse(data []byte) (File, error) {
	panic("not implemented") // Developer
}
