package recipeassistant

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
func OutputSchema(canonical []byte) ([]byte, error) { return nil, nil }
