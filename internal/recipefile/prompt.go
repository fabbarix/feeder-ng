package recipefile

import (
	"errors"
	"strings"
)

// ErrNoTemplate means the Agent Prompt template block was not found in recipe-file.md.
var ErrNoTemplate = errors.New("agent prompt template not found")

const (
	agentHeading = "## Agent Prompt"
	fenceOpen    = "````text"
	fenceClose   = "````"
)

// ExtractTemplate returns the Agent Prompt template from recipe-file.md: the
// content of the fenced block (the one fenced with four backticks and the
// language "text") under the "## Agent Prompt" heading, without the fences and
// without a trailing newline.
func ExtractTemplate(recipeFileMD string) (string, error) {
	lines := strings.Split(recipeFileMD, "\n")
	inSection := false
	var body []string
	open := false
	for _, line := range lines {
		trimmed := strings.TrimRight(line, " \t\r")
		if !open {
			if strings.HasPrefix(trimmed, "## ") {
				inSection = trimmed == agentHeading
				continue
			}
			if inSection && trimmed == fenceOpen {
				open = true
			}
			continue
		}
		if trimmed == fenceClose {
			return strings.Join(body, "\n"), nil
		}
		body = append(body, line)
	}
	return "", ErrNoTemplate
}

// AgentPrompt replaces {{SCHEMA}} and {{EXAMPLE}} in the template with the
// schema and example file contents (verbatim, trailing newlines trimmed). The
// result is what "Copy Agent Prompt" copies.
func AgentPrompt(template, schema, example string) string {
	schema = strings.TrimRight(schema, "\r\n")
	example = strings.TrimRight(example, "\r\n")
	// One pass, so text inserted for one placeholder is never expanded again.
	r := strings.NewReplacer("{{SCHEMA}}", schema, "{{EXAMPLE}}", example)
	return r.Replace(template)
}
