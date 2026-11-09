package recipefile

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/fabbarix/feeder-ng/docs/spec"
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

var (
	schemaOnce sync.Once
	schemaVal  *jsonschema.Schema
	schemaErr  error
)

// compiledSchema compiles the embedded schema once. The schema is registered
// under its own $id from the embedded bytes, so no network is used.
func compiledSchema() (*jsonschema.Schema, error) {
	schemaOnce.Do(func() {
		var head struct {
			ID string `json:"$id"`
		}
		if err := json.Unmarshal(spec.Schema, &head); err != nil || head.ID == "" {
			schemaErr = fmt.Errorf("embedded schema has no $id: %v", err)
			return
		}
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(spec.Schema))
		if err != nil {
			schemaErr = err
			return
		}
		c := jsonschema.NewCompiler()
		c.DefaultDraft(jsonschema.Draft2020)
		if err := c.AddResource(head.ID, doc); err != nil {
			schemaErr = err
			return
		}
		schemaVal, schemaErr = c.Compile(head.ID)
	})
	return schemaVal, schemaErr
}

// Parse decodes and validates a Recipe File against the embedded schema
// (docs/spec via the spec package; JSON Schema 2020-12 through
// github.com/santhosh-tekuri/jsonschema/v6). A leading UTF-8 BOM is ignored.
// Order: size (ErrTooLarge), syntax (*SyntaxError), version
// (*VersionError), schema (*SchemaError).
func Parse(data []byte) (File, error) {
	if len(data) > MaxFileBytes {
		return File{}, ErrTooLarge
	}
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))

	var generic any
	if err := json.Unmarshal(data, &generic); err != nil {
		return File{}, &SyntaxError{Message: "the file is not valid JSON: " + err.Error()}
	}
	if err := checkVersion(data); err != nil {
		return File{}, err
	}
	sch, err := compiledSchema()
	if err != nil {
		return File{}, err
	}
	if err := sch.Validate(generic); err != nil {
		var ve *jsonschema.ValidationError
		if !errors.As(err, &ve) {
			return File{}, err
		}
		return File{}, &SchemaError{Errors: schemaPaths(ve)}
	}
	var f File
	if err := json.Unmarshal(data, &f); err != nil {
		return File{}, &SchemaError{Errors: []PathError{{Path: "$", Message: err.Error()}}}
	}
	return f, nil
}

// checkVersion reports a present "version" that is not the integer 1.
func checkVersion(data []byte) error {
	var head struct {
		Version json.RawMessage `json:"version"`
	}
	if err := json.Unmarshal(data, &head); err != nil || head.Version == nil {
		return nil // not an object, or no version: the schema reports it
	}
	raw := strings.TrimSpace(string(head.Version))
	if raw == strconv.Itoa(Version) {
		return nil
	}
	return &VersionError{Version: raw}
}

// schemaPaths flattens a validation error tree into sorted PathErrors.
func schemaPaths(root *jsonschema.ValidationError) []PathError {
	out := []PathError{}
	seen := map[PathError]bool{}
	var walk func(e *jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if len(e.Causes) == 0 {
			p := PathError{Path: jsonPath(e.InstanceLocation), Message: leafMessage(e)}
			if p.Message == "" {
				p.Message = strings.Join(e.ErrorKind.KeywordPath(), "/")
			}
			if !seen[p] {
				seen[p] = true
				out = append(out, p)
			}
			return
		}
		for _, c := range e.Causes {
			walk(c)
		}
	}
	walk(root)
	sort.SliceStable(out, func(i, j int) bool { return pathLess(out[i].Path, out[j].Path) })
	return out
}

// leafMessage is the localised text of a leaf error.
func leafMessage(e *jsonschema.ValidationError) string {
	u := e.BasicOutput()
	var msg string
	var find func(u *jsonschema.OutputUnit)
	find = func(u *jsonschema.OutputUnit) {
		if msg != "" {
			return
		}
		if u.Error != nil && !u.Valid {
			msg = u.Error.String()
		}
		for i := range u.Errors {
			find(&u.Errors[i])
		}
	}
	find(u)
	return msg
}

// jsonPath turns instance tokens into "$.recipes[0].name".
func jsonPath(tokens []string) string {
	var sb strings.Builder
	sb.WriteString("$")
	for _, t := range tokens {
		if _, err := strconv.Atoi(t); err == nil {
			sb.WriteString("[" + t + "]")
		} else {
			sb.WriteString("." + t)
		}
	}
	return sb.String()
}

// pathLess orders paths segment by segment, numeric indexes by value.
func pathLess(a, b string) bool {
	as, bs := strings.FieldsFunc(a, splitPath), strings.FieldsFunc(b, splitPath)
	for i := 0; i < len(as) && i < len(bs); i++ {
		if as[i] == bs[i] {
			continue
		}
		ai, errA := strconv.Atoi(as[i])
		bi, errB := strconv.Atoi(bs[i])
		if errA == nil && errB == nil {
			return ai < bi
		}
		return as[i] < bs[i]
	}
	return len(as) < len(bs)
}

func splitPath(r rune) bool { return r == '.' || r == '[' || r == ']' }
