package receipt_test

import (
	"bytes"
	"encoding/json"
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
)

// RR1: the hand-written output schema (design §5). In 1.0.0-beta.6 a schema with 9 union-typed properties failed with
// "The compiled grammar is too large"; the receipt schema has no unions at all and is held to a budget.

func decodeSchema(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("schema is not JSON: %v", err)
	}
	return m
}

func TestOutputSchemaMatchesTheGoldenByteForByte(t *testing.T) {
	golden, err := os.ReadFile("testdata/output-schema.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if got := receipt.OutputSchema(); !bytes.Equal(got, bytes.TrimRight(golden, "\n")) {
		t.Errorf("OutputSchema() differs from testdata/output-schema.golden.json (%d vs %d bytes): the schema is sent byte for byte, change the golden and run the live test", len(got), len(golden))
	}
}

// budget reports every violation of the schema budget; the tests below run it on the real schema and on bad ones.
func budget(root map[string]any) []string {
	var bad []string
	props, arrays, enums := 0, 0, 0
	var walk func(path string, s map[string]any, depthInArray int)
	walk = func(path string, s map[string]any, depthInArray int) {
		for _, k := range []string{"anyOf", "oneOf", "allOf", "$ref", "$defs", "pattern", "format"} {
			if _, ok := s[k]; ok {
				bad = append(bad, path+": "+k+" is not allowed")
			}
		}
		if _, ok := s["type"].([]any); ok {
			bad = append(bad, path+": a list-valued type is a union")
		}
		if e, ok := s["enum"].([]any); ok {
			enums++
			if len(e) > 4 {
				bad = append(bad, path+": the enum is larger than 4 values")
			}
		}
		if s["type"] == "array" {
			arrays++
			if depthInArray >= 1 {
				bad = append(bad, path+": an array inside an array")
			}
			items, _ := s["items"].(map[string]any)
			if items == nil {
				bad = append(bad, path+": array without items")
				return
			}
			walk(path+"[]", items, depthInArray+1)
		}
		if s["type"] == "object" {
			if depthInArray >= 1 && path != "$.lines[]" {
				bad = append(bad, path+": an object nested inside array items")
			}
			p, _ := s["properties"].(map[string]any)
			if s["additionalProperties"] != false {
				bad = append(bad, path+": additionalProperties must be false")
			}
			req := map[string]bool{}
			for _, r := range toStrings(s["required"]) {
				req[r] = true
			}
			for name, c := range p {
				props++
				if !req[name] {
					bad = append(bad, path+"."+name+": not required")
				}
				cm, _ := c.(map[string]any)
				if depthInArray >= 1 && (cm["type"] == "object" || cm["type"] == "array") {
					bad = append(bad, path+"."+name+": nested inside the line objects")
				}
				walk(path+"."+name, cm, depthInArray)
			}
			if len(req) != len(p) {
				bad = append(bad, path+": required and properties differ")
			}
		}
	}
	walk("$", root, 0)
	if props > 16 {
		bad = append(bad, "more than 16 properties in total")
	}
	if arrays > 1 {
		bad = append(bad, "more than one array")
	}
	if enums > 1 {
		bad = append(bad, "more than one enum")
	}
	return bad
}

func toStrings(v any) []string {
	var out []string
	l, _ := v.([]any)
	for _, x := range l {
		if s, ok := x.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func TestOutputSchemaIsWithinTheBudget(t *testing.T) {
	if bad := budget(decodeSchema(t, receipt.OutputSchema())); len(bad) > 0 {
		t.Errorf("schema budget exceeded:\n  %s", strings.Join(bad, "\n  "))
	}
}

func TestOutputSchemaHasExactlyTheDocumentedShape(t *testing.T) {
	root := decodeSchema(t, receipt.OutputSchema())
	top := root["properties"].(map[string]any)
	var names []string
	for n := range top {
		names = append(names, n)
	}
	sort.Strings(names)
	if got := strings.Join(names, ","); got != "date,lines,readable,shopName,totalCents" {
		t.Errorf("top-level properties = %s", got)
	}
	lines := top["lines"].(map[string]any)
	if lines["type"] != "array" {
		t.Fatalf("lines is %v", lines["type"])
	}
	item := lines["items"].(map[string]any)
	ip := item["properties"].(map[string]any)
	if len(ip) != 10 || len(top) != 5 {
		t.Errorf("want 5 + 10 properties, got %d + %d", len(top), len(ip))
	}
	want := map[string]string{"row": "integer", "text": "string", "count": "integer", "grams": "integer", "priceCents": "integer",
		"unitPriceCents": "integer", "perKgCents": "integer", "name": "string", "packSize": "integer", "packUnit": "string"}
	for n, ty := range want {
		if p, _ := ip[n].(map[string]any); p == nil || p["type"] != ty {
			t.Errorf("lines[].%s must be %s: %v", n, ty, ip[n])
		}
	}
	unit := ip["packUnit"].(map[string]any)["enum"]
	if b, _ := json.Marshal(unit); string(b) != `["g","ml","piece",""]` {
		t.Errorf("packUnit enum = %s", b)
	}
}

func TestBudgetRejectsAUnion(t *testing.T) {
	for name, s := range map[string]string{
		"anyOf":      `{"type":"object","additionalProperties":false,"required":["a"],"properties":{"a":{"anyOf":[{"type":"integer"},{"type":"null"}]}}}`,
		"type list":  `{"type":"object","additionalProperties":false,"required":["a"],"properties":{"a":{"type":["integer","null"]}}}`,
		"$defs":      `{"type":"object","additionalProperties":false,"required":[],"properties":{},"$defs":{"x":{}}}`,
		"optional":   `{"type":"object","additionalProperties":false,"required":[],"properties":{"a":{"type":"integer"}}}`,
		"open":       `{"type":"object","required":["a"],"properties":{"a":{"type":"integer"}}}`,
		"nested arr": `{"type":"object","additionalProperties":false,"required":["l"],"properties":{"l":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["m"],"properties":{"m":{"type":"array","items":{"type":"string"}}}}}}}`,
	} {
		if bad := budget(decodeSchema(t, []byte(s))); len(bad) == 0 {
			t.Errorf("%s: the budget must reject this schema", name)
		}
	}
}

func TestBudgetRejectsMoreThanSixteenProperties(t *testing.T) {
	props, req := map[string]any{}, []any{}
	for i := 0; i < 17; i++ {
		n := string(rune('a' + i))
		props[n] = map[string]any{"type": "integer"}
		req = append(req, n)
	}
	s := map[string]any{"type": "object", "additionalProperties": false, "required": req, "properties": props}
	if bad := budget(s); len(bad) == 0 {
		t.Error("17 properties must exceed the budget")
	}
}

func TestOutputSchemaCountsFifteenPropertiesAndNoUnions(t *testing.T) {
	raw := receipt.OutputSchema()
	for _, banned := range []string{"anyOf", "oneOf", "allOf", `"$ref"`, `"$defs"`, `"pattern"`, `"format"`, `"null"`} {
		if bytes.Contains(raw, []byte(banned)) {
			t.Errorf("schema contains %s", banned)
		}
	}
	if n := bytes.Count(raw, []byte(`"enum"`)); n != 1 {
		t.Errorf("want exactly one enum, got %d", n)
	}
	if n := bytes.Count(raw, []byte(`"type": "array"`)) + bytes.Count(raw, []byte(`"type":"array"`)); n != 1 {
		t.Errorf("want exactly one array, got %d", n)
	}
}
