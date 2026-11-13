package receipt

// outputSchemaJSON is the receipt output schema, sent byte for byte (design §5). It is hand-written: no unions, no
// $ref, one enum and one array, 15 properties, so the grammar stays small. Its golden is testdata/output-schema.golden.json;
// a change to it needs the opt-in live schema check.
const outputSchemaJSON = `{
  "type": "object",
  "additionalProperties": false,
  "required": ["readable", "shopName", "date", "totalCents", "lines"],
  "properties": {
    "readable":   {"type": "boolean", "description": "false when the photos show no shop receipt; then lines is []"},
    "shopName":   {"type": "string",  "description": "the shop's name as printed, or \"\""},
    "date":       {"type": "string",  "description": "the purchase date as YYYY-MM-DD, or \"\" when it cannot be read"},
    "totalCents": {"type": "integer", "description": "the total paid in minor units, or -1 when it cannot be read"},
    "lines": {
      "type": "array",
      "description": "one entry per bought line, in receipt order",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["row", "text", "count", "grams", "priceCents", "unitPriceCents", "perKgCents", "name", "packSize", "packUnit"],
        "properties": {
          "row":            {"type": "integer", "description": "the index of the Scanned row this line is, or -1 when none"},
          "text":           {"type": "string",  "description": "the line as printed"},
          "count":          {"type": "integer", "description": "packs bought on this line; 0 for a weighed line"},
          "grams":          {"type": "integer", "description": "the weight of a weighed line in grams; 0 otherwise"},
          "priceCents":     {"type": "integer", "description": "the amount of the line after its own discount, minor units; -1 if unreadable"},
          "unitPriceCents": {"type": "integer", "description": "the price of one pack if printed, else -1"},
          "perKgCents":     {"type": "integer", "description": "the price per kg (or per litre) if printed, else -1"},
          "name":           {"type": "string",  "description": "row -1: a short Product name from the line; a matched row: a corrected name only if the row's is clearly wrong; else \"\""},
          "packSize":       {"type": "integer", "description": "the pack size printed on the line, in packUnit; 0 if not printed"},
          "packUnit":       {"type": "string",  "enum": ["g", "ml", "piece", ""], "description": "the unit of packSize; \"\" when packSize is 0"}
        }
      }
    }
  }
}`

// OutputSchema returns the JSON schema of the model's answer (the request's output_format), sent byte for byte.
func OutputSchema() []byte {
	return []byte(outputSchemaJSON)
}
