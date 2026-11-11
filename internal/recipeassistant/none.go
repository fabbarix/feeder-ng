package recipeassistant

import (
	"encoding/json"
	"strings"
	"sync"

	"github.com/fabbarix/feeder-ng/docs/spec"
)

// The output schema makes every field required (OutputSchema), so the model writes an explicit "none" for a field
// the source does not give: "" for text, [] for a list, {} left empty, null for a nullable number, 0 for an optional
// plain number. pruneNone removes those again, but only where the canonical Recipe File schema leaves the property
// optional; a required field keeps whatever the model wrote, so validation still catches a missing name.

var canonical = sync.OnceValues(func() (map[string]any, error) {
	var root map[string]any
	err := json.Unmarshal(spec.Schema, &root)
	return root, err
})

// pruneNone removes the "none" values of optional properties from the model's answer (in place) and returns it.
func pruneNone(answer map[string]any) map[string]any {
	root, err := canonical()
	if err != nil {
		return answer
	}
	defs, _ := root["$defs"].(map[string]any)
	pruneValue(answer, root, defs)
	return answer
}

func pruneValue(v any, schema map[string]any, defs map[string]any) {
	schema = resolve(schema, defs)
	switch val := v.(type) {
	case map[string]any:
		props, _ := schema["properties"].(map[string]any)
		required := map[string]bool{}
		if req, ok := schema["required"].([]any); ok {
			for _, r := range req {
				if name, ok := r.(string); ok {
					required[name] = true
				}
			}
		}
		for key, child := range val {
			cs, ok := props[key].(map[string]any)
			if !ok {
				continue
			}
			pruneValue(child, cs, defs)
			if !required[key] && isNone(child, resolve(cs, defs)) {
				delete(val, key)
			}
		}
	case []any:
		items, ok := schema["items"].(map[string]any)
		if !ok {
			return
		}
		for _, item := range val {
			pruneValue(item, items, defs)
		}
	}
}

// resolve follows a local "#/$defs/<name>" reference.
func resolve(schema map[string]any, defs map[string]any) map[string]any {
	ref, _ := schema["$ref"].(string)
	if name, ok := strings.CutPrefix(ref, "#/$defs/"); ok {
		if d, ok := defs[name].(map[string]any); ok {
			return d
		}
	}
	return schema
}

// isNone reports an explicit "none": null, blank text, an empty list or object, or 0 for a plain number (a nullable
// one says none with null, and 0 may mean something there, such as a same-day Use-by).
func isNone(v any, schema map[string]any) bool {
	switch val := v.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(val) == ""
	case []any:
		return len(val) == 0
	case map[string]any:
		return len(val) == 0
	case float64:
		return val == 0 && schema["type"] == "number"
	}
	return false
}
