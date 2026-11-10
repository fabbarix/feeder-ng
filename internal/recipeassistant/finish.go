package recipeassistant

import "github.com/fabbarix/feeder-ng/internal/recipefile"

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
	return Finished{}, &Error{Code: "not_implemented"}
}

// MaxRepairLines is how many "path: message" lines a repair turn lists.
const MaxRepairLines = 30

// RepairPrompt formats up to MaxRepairLines errors, one "path: message" per
// line, with a final "... and N more" line when truncated.
func RepairPrompt(errs []recipefile.PathError) string { return "" }

// TextImageURLs returns the https URLs that appear in pasted text, in order of
// appearance, de-duplicated, without trailing punctuation ). , ; : ! ? ] > " '.
func TextImageURLs(text string) []string { return nil }
