package recipeassistant

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// FinishInput is what the server knows about the read, independent of the model.
type FinishInput struct {
	Kind            SourceKind
	PageURL         string   // page reads: the final URL
	SourceImageURLs []string // the image allowlist (page images, or TextImageURLs of pasted text); empty for photos
	FallbackImage   string   // page reads: image to set on the first Recipe if it has none
}

// Warning does not block the read (a dropped image).
type Warning struct{ Path, Code, Message string }

// WarnImageNotInSource is the Warning code for an image the source does not contain.
const WarnImageNotInSource = "image_not_in_source"

// Finished is a validated Recipe File ready for Import Review.
type Finished struct {
	File     recipefile.File
	Warnings []Warning
}

// Finish turns the model's JSON answer into a validated Recipe File (design
// §4.4, §4.5 steps 1-4); failures are *Error:
//  1. not a JSON object -> CodeInvalidOutput;
//  2. "noRecipe": true, or no Recipes -> CodeNoRecipeFound; more than
//     MaxRecipes -> CodeTooManyRecipes;
//  3. server-controlled fields: format and version forced, exportedAt and
//     noRecipe removed, source.url = PageURL for page reads and removed
//     otherwise (attribution kept), every Recipe and Step image not in
//     SourceImageURLs removed with a WarnImageNotInSource warning at its path,
//     the first Recipe's image set to FallbackImage (page reads) when empty,
//     tags trimmed, lower-cased, de-duplicated and emptied entries dropped;
//  4. recipefile.Parse then recipefile.CheckFile; any errors ->
//     CodeInvalidOutput with Paths (all of them, in order).
func Finish(raw []byte, in FinishInput) (Finished, error) {
	var generic any
	if err := json.Unmarshal(raw, &generic); err != nil {
		return Finished{}, &Error{Code: CodeInvalidOutput, Message: "the answer is not JSON"}
	}
	root, ok := generic.(map[string]any)
	if !ok {
		return Finished{}, &Error{Code: CodeInvalidOutput, Message: "the answer is not a JSON object"}
	}
	// The output schema made every field required; drop the "none" values of the optional ones (pruneNone).
	root = pruneNone(root)
	if flag, _ := root["noRecipe"].(bool); flag {
		return Finished{}, &Error{Code: CodeNoRecipeFound}
	}
	recipes, isList := root["recipes"].([]any)
	if root["recipes"] != nil && !isList {
		return Finished{}, &Error{Code: CodeInvalidOutput, Message: "recipes is not a list",
			Paths: []recipefile.PathError{{Path: "$.recipes", Message: "must be an array"}}}
	}
	if len(recipes) == 0 {
		return Finished{}, &Error{Code: CodeNoRecipeFound}
	}
	if len(recipes) > MaxRecipes {
		return Finished{}, &Error{Code: CodeTooManyRecipes}
	}

	root["format"] = recipefile.Format
	root["version"] = recipefile.Version
	delete(root, "exportedAt")
	delete(root, "noRecipe")

	allowed := make(map[string]bool, len(in.SourceImageURLs))
	for _, u := range in.SourceImageURLs {
		allowed[u] = true
	}
	var warnings []Warning
	filter := func(m map[string]any, path string) {
		img, present := m["image"]
		if !present {
			return
		}
		if s, isStr := img.(string); isStr && s != "" && allowed[s] && in.Kind != KindPhoto {
			return
		}
		delete(m, "image")
		warnings = append(warnings, Warning{Path: path, Code: WarnImageNotInSource,
			Message: "the image is not in the source, so it was left out"})
	}
	pageURLOK := in.Kind == KindPage && strings.HasPrefix(in.PageURL, "https://")
	for i, r := range recipes {
		rec, ok := r.(map[string]any)
		if !ok {
			continue
		}
		fixSource(rec, in.Kind == KindPage, pageURLOK, in.PageURL)
		filter(rec, fmt.Sprintf("$.recipes[%d].image", i))
		if steps, ok := rec["steps"].([]any); ok {
			for j, st := range steps {
				if sm, ok := st.(map[string]any); ok {
					filter(sm, fmt.Sprintf("$.recipes[%d].steps[%d].image", i, j))
				}
			}
		}
		if tags, ok := rec["tags"].([]any); ok {
			if clean := cleanTags(tags); len(clean) > 0 {
				rec["tags"] = clean
			} else {
				delete(rec, "tags")
			}
		}
	}
	if in.Kind == KindPage && in.FallbackImage != "" && len(recipes) > 0 {
		if first, ok := recipes[0].(map[string]any); ok {
			if img, _ := first["image"].(string); img == "" {
				first["image"] = in.FallbackImage
			}
		}
	}

	cleaned, err := json.Marshal(root)
	if err != nil {
		return Finished{}, &Error{Code: CodeInvalidOutput, Message: err.Error()}
	}
	file, err := recipefile.Parse(cleaned)
	if err != nil {
		var se *recipefile.SchemaError
		if errors.As(err, &se) {
			return Finished{}, &Error{Code: CodeInvalidOutput, Paths: se.Errors}
		}
		return Finished{}, &Error{Code: CodeInvalidOutput, Message: err.Error(),
			Paths: []recipefile.PathError{{Path: "$", Message: err.Error()}}}
	}
	if errs := recipefile.CheckFile(file); len(errs) > 0 {
		return Finished{}, &Error{Code: CodeInvalidOutput, Paths: errs}
	}
	return Finished{File: file, Warnings: warnings}, nil
}

// fixSource makes source.url the server's: the fetched URL on page reads (when
// it is https), absent otherwise. Attribution is kept; an empty source goes.
func fixSource(rec map[string]any, page, urlOK bool, pageURL string) {
	src, isMap := rec["source"].(map[string]any)
	if rec["source"] != nil && !isMap {
		return // the schema reports it
	}
	if src == nil {
		src = map[string]any{}
	}
	delete(src, "url")
	if page && urlOK {
		src["url"] = pageURL
	}
	if len(src) == 0 {
		delete(rec, "source")
		return
	}
	rec["source"] = src
}

// cleanTags trims, lower-cases and de-duplicates string tags and drops empty
// ones; non-string entries are left for the schema to report.
func cleanTags(tags []any) []any {
	seen := map[string]bool{}
	out := make([]any, 0, len(tags))
	for _, t := range tags {
		s, ok := t.(string)
		if !ok {
			out = append(out, t)
			continue
		}
		s = strings.ToLower(strings.TrimSpace(s))
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// MaxRepairLines is how many "path: message" lines a repair turn lists.
const MaxRepairLines = 30

// RepairPrompt formats up to MaxRepairLines errors, one "path: message" per
// line, with a final "... and N more" line when truncated.
func RepairPrompt(errs []recipefile.PathError) string {
	var lines []string
	for i, e := range errs {
		if i == MaxRepairLines {
			lines = append(lines, fmt.Sprintf("... and %d more", len(errs)-MaxRepairLines))
			break
		}
		lines = append(lines, e.Path+": "+e.Message)
	}
	return strings.Join(lines, "\n")
}

var urlPattern = regexp.MustCompile(`https://[^\s<>"]+`)

// TextImageURLs returns the https URLs that appear in pasted text, in order of
// appearance, de-duplicated, without trailing punctuation ). , ; : ! ? ] > " '
// (and a final full stop).
func TextImageURLs(text string) []string {
	var out []string
	seen := map[string]bool{}
	for _, m := range urlPattern.FindAllString(text, -1) {
		m = strings.TrimRight(m, ").,;:!?]>\"'")
		if m == "https://" || seen[m] {
			continue
		}
		seen[m] = true
		out = append(out, m)
	}
	return out
}
