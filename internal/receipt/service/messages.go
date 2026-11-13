package service

import (
	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	rasvc "github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

// CodeAssistantUnavailable is the code of a refusal because the assistant cannot read (HTTP 409, with a reason).
const CodeAssistantUnavailable = "assistant_unavailable"

// messages are the receipt copy of the codes (design §9); the other codes use the Recipe Assistant's copy.
var messages = map[string]string{
	CodeAssistantUnavailable:             "The Recipe Assistant isn't working. An Admin can check it in Settings.",
	CodeScansEmpty:                       "Scan something first.",
	CodeCancelled:                        "The read was cancelled.",
	receipt.CodeNoReceiptFound:           "No receipt found in the photos. Take it flat, in good light.",
	recipeassistant.CodeUnreachable:      "Couldn't reach the assistant. Check the connection and try again.",
	recipeassistant.CodeBusy:             "The assistant is busy. Try again in a minute.",
	recipeassistant.CodeRateLimited:      "The assistant is busy. Try again in a minute.",
	recipeassistant.CodeDeclined:         "The assistant would not read this photo. Try a clearer photo of the receipt.",
	recipeassistant.CodeOutputTooLong:    "This receipt is too long to read at once. Read it in two parts.",
	recipeassistant.CodeInvalidOutput:    "The assistant's answer couldn't be used. Try again.",
	recipeassistant.CodeBadKey:           "The Recipe Assistant isn't working. An Admin can check it in Settings.",
	recipeassistant.CodeBilling:          "The Recipe Assistant isn't working. An Admin can check it in Settings.",
	recipeassistant.CodeForbidden:        "The Recipe Assistant isn't working. An Admin can check it in Settings.",
	recipeassistant.CodeModelUnavailable: "The Recipe Assistant isn't working. An Admin can check it in Settings.",
}

// Message is the plain-English text that goes with an error code.
func Message(code string) string {
	if m, ok := messages[code]; ok {
		return m
	}
	return rasvc.Message(code)
}
