// Package httpx holds the JSON helpers shared by the HTTP layer. It is a leaf
// package: it imports nothing from the Feeder.
package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const maxBody = 1 << 20 // 1 MiB

// APIError is an error that maps directly to an HTTP response.
type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string { return fmt.Sprintf("%s: %s", e.Code, e.Message) }

// WriteJSON writes v as a JSON body with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError writes the standard {"error":{"code","message"}} body.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

// WriteAPIError writes an *APIError with its own status, and anything else as
// a generic 500 that never leaks the underlying detail.
func WriteAPIError(w http.ResponseWriter, err error) {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		WriteError(w, apiErr.Status, apiErr.Code, apiErr.Message)
		return
	}
	WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
}

// DecodeJSON reads a JSON request body (at most 1 MiB) into v. An empty,
// invalid or oversized body yields a 400 *APIError.
func DecodeJSON(r *http.Request, v any) error {
	bad := &APIError{Status: http.StatusBadRequest, Code: "bad_request", Message: "The request body must be JSON"}
	if r.Body == nil {
		return bad
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil || len(raw) > maxBody || strings.TrimSpace(string(raw)) == "" {
		return bad
	}
	if err := json.Unmarshal(raw, v); err != nil {
		return bad
	}
	return nil
}
