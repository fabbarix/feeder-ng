package service

import "github.com/fabbarix/feeder-ng/internal/recipeassistant"

// Message is the plain-English text the API sends with an error code. It never carries a cause that would help
// map the server's network (an address that was refused, a status that was returned).
func Message(code string) string {
	if m, ok := messages[code]; ok {
		return m
	}
	return "The Recipe Assistant could not finish."
}

var messages = map[string]string{
	CodeAssistantOff:                          "The Recipe Assistant is not available.",
	CodeURLInvalid:                            "Give a web address that starts with https://.",
	CodePageUnavailable:                       "The page could not be opened.",
	CodePhotosEmpty:                           "Add at least one photo.",
	CodeTooManyPhotos:                         "Use at most 4 photos.",
	CodePhotoTooLarge:                         "A photo is too large.",
	CodePhotoUnsupported:                      "A photo is not a picture Feeder can read.",
	CodePhotoUnavailable:                      "A photo could not be fetched.",
	CodePhotosNotSupport:                      "This model can't read photos.",
	CodeModelUnavailable:                      "That model is not available.",
	CodeAPIKeyRefused:                         "The API key was refused.",
	CodeCannotRead:                            "That model can't produce Recipe Files.",
	recipeassistant.CodeBadKey:                "The API key was refused. Ask an Admin to check it.",
	recipeassistant.CodeForbidden:             "The API key is not allowed to use this model.",
	recipeassistant.CodeBilling:               "The account behind the API key has a billing problem.",
	recipeassistant.CodeModelUnavailable:      "The chosen model is no longer available. Ask an Admin to pick another.",
	recipeassistant.CodeRequestRejected:       "The service did not accept the request. Check the base URL.",
	recipeassistant.CodeRateLimited:           "The service is busy with other requests. Try again later.",
	recipeassistant.CodeBusy:                  "The service is overloaded. Try again in a moment.",
	recipeassistant.CodeUnreachable:           "The service could not be reached in time.",
	recipeassistant.CodeDeclined:              "The model declined to read this source.",
	recipeassistant.CodeOutputTooLong:         "The recipe was too long for the model to write out.",
	recipeassistant.CodeInvalidOutput:         "The model's answer was not a valid Recipe File.",
	recipeassistant.CodeSourceTooLong:         "The source is too long to read.",
	recipeassistant.CodeNoRecipeFound:         "No recipe was found in the source.",
	recipeassistant.CodeTooManyRecipes:        "The source holds too many recipes; use a smaller part of it.",
	recipeassistant.CodeTextEmpty:             "Paste some text.",
	recipeassistant.CodeTextTooLong:           "The text is longer than 50,000 characters.",
	recipeassistant.CodeReadInProgress:        "A read is already running.",
	recipeassistant.CodeTooManyReads:          "The Household has used its reads for this hour.",
	recipeassistant.CodeSecretKeyMissing:      "The server has no secret key, so the Recipe Assistant cannot be turned on.",
	recipeassistant.CodeKeyRequiredNewBaseURL: "Enter the API key again when you change the address.",
	recipeassistant.CodeAPIKeyRequired:        "An API key is required.",
	recipeassistant.CodeAPIKeyInvalid:         "The API key has spaces or is too long.",
	recipeassistant.CodeBaseURLInvalid:        "The base URL must be an https address.",
	recipeassistant.CodeBaseURLHasVersion:     "Leave /v1 off the base URL.",
	recipeassistant.CodeModelInvalid:          "The model ID is not valid.",
}
