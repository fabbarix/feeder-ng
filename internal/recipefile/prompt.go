package recipefile

import "errors"

// ErrNoTemplate means the Agent Prompt template block was not found in recipe-file.md.
var ErrNoTemplate = errors.New("agent prompt template not found")

// ExtractTemplate returns the Agent Prompt template from recipe-file.md: the
// content of the fenced block (the one fenced with four backticks and the
// language "text") under the "## Agent Prompt" heading, without the fences and
// without a trailing newline.
func ExtractTemplate(recipeFileMD string) (string, error) {
	panic("not implemented") // Developer
}

// AgentPrompt replaces {{SCHEMA}} and {{EXAMPLE}} in the template with the
// schema and example file contents (verbatim, trailing newlines trimmed). The
// result is what "Copy Agent Prompt" copies.
func AgentPrompt(template, schema, example string) string {
	panic("not implemented") // Developer
}
