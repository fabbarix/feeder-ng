package recipeassistant

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
)

// OutputSchema projects the canonical Recipe File JSON Schema
// (docs/spec/recipe-file-v1.schema.json) onto what structured outputs accept
// (design §4.6). Pure and deterministic (same input, same bytes). It:
//   - keeps type, properties, required, items, enum, const, $defs, $ref, anyOf,
//     description, additionalProperties:false, and format date-time and uri;
//   - drops $schema, $id, title, minimum, maximum, exclusiveMinimum,
//     exclusiveMaximum, minLength, maxLength, minItems, maxItems, uniqueItems,
//     pattern, default, if, then, else, not, allOf;
//   - turns type ["integer","null"] into anyOf [{type:integer},{type:null}];
//   - replaces the image definition's anyOf with {type:string, description};
//   - removes exportedAt, and adds an optional top-level noRecipe: boolean;
//   - keeps additionalProperties:false on every object.
func OutputSchema(canonical []byte) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(canonical))
	dec.UseNumber()
	var root any
	if err := dec.Decode(&root); err != nil {
		return nil, fmt.Errorf("output schema: %w", err)
	}
	obj, ok := root.(map[string]any)
	if !ok {
		return nil, errors.New("output schema: the canonical schema must be a JSON object")
	}
	out := projectSchema(obj)
	if props, ok := out["properties"].(map[string]any); ok {
		delete(props, "exportedAt")
		props["noRecipe"] = map[string]any{
			"type":        "boolean",
			"description": "true when the source contains no recipe; then recipes is empty",
		}
	}
	if req, ok := out["required"].([]any); ok {
		kept := make([]any, 0, len(req))
		for _, r := range req {
			if r != "exportedAt" {
				kept = append(kept, r)
			}
		}
		out["required"] = kept
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(out); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// imageDescription replaces the image definition's pattern branches: the
// model cannot be held to a regular expression, the server filters later.
const imageDescription = "an https image URL that appears in the source text"

// projectSchema copies one schema object keeping only the accepted keywords.
// Property names inside "properties" and "$defs" are never mistaken for keywords.
func projectSchema(in map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range in {
		switch k {
		case "properties", "$defs":
			m, _ := v.(map[string]any)
			sub := make(map[string]any, len(m))
			for name, child := range m {
				c, ok := child.(map[string]any)
				if !ok {
					continue
				}
				if k == "$defs" && name == "image" {
					sub[name] = map[string]any{"type": "string", "description": imageDescription}
					continue
				}
				sub[name] = projectSchema(c)
			}
			out[k] = sub
		case "items":
			if c, ok := v.(map[string]any); ok {
				out[k] = projectSchema(c)
			}
		case "anyOf":
			list, _ := v.([]any)
			branches := make([]any, 0, len(list))
			for _, b := range list {
				if c, ok := b.(map[string]any); ok {
					branches = append(branches, projectSchema(c))
				}
			}
			out[k] = branches
		case "type":
			if list, ok := v.([]any); ok {
				branches := make([]any, len(list))
				for i, t := range list {
					branches[i] = map[string]any{"type": t}
				}
				out["anyOf"] = branches
			} else {
				out[k] = v
			}
		case "format":
			if f, _ := v.(string); f == "date-time" || f == "uri" {
				out[k] = v
			}
		case "required", "enum", "const", "description", "$ref":
			out[k] = v
		}
	}
	if out["type"] == "object" {
		out["additionalProperties"] = false
	}
	return out
}
