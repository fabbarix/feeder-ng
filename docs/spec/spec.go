// Package spec embeds the published Recipe File specification files, so the
// binary serves exactly what docs/spec contains (the files stay the single
// source). Used by internal/recipefile for the schema endpoint, Import Review
// validation and the Agent Prompt.
package spec

import _ "embed"

// Schema is recipe-file-v1.schema.json.
//
//go:embed recipe-file-v1.schema.json
var Schema []byte

// Example is examples/recipe-file-example.json.
//
//go:embed examples/recipe-file-example.json
var Example []byte

// RecipeFileMD is recipe-file.md, which holds the Agent Prompt template.
//
//go:embed recipe-file.md
var RecipeFileMD string
