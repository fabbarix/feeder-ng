package service

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	rasvc "github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

// Unavailable reasons are the Recipe Assistant's (rasvc.Link.Reason) passed through.

// raAssistant is the Assistant port over the Recipe Assistant's service: the same availability, client factory,
// Limiter and model rules as its own reads (internal/recipeassistant/service/shared.go).
type raAssistant struct{ s *rasvc.Service }

// FromRecipeAssistant returns the Assistant of a receipt read: the Recipe Assistant's shared service.
func FromRecipeAssistant(s *rasvc.Service) Assistant { return raAssistant{s: s} }

// Ready reports the assistant's availability, the model and its client.
func (a raAssistant) Ready(ctx context.Context) (Ready, error) {
	l, err := a.s.Link(ctx)
	if err != nil {
		return Ready{}, err
	}
	if l.Reason != "" {
		return Ready{}, &Unavailable{Reason: l.Reason}
	}
	return Ready{Model: l.Model, Claude: l.Client, ImagesOK: l.ImagesOK, Effort: l.Effort}, nil
}

// Check is the Limiter's Check: the same limits as the recipe reads.
func (a raAssistant) Check(c recipeassistant.Caller) error { return a.s.Check(c) }

// Acquire takes the User's running slot and counts the read, as the recipe reads do.
func (a raAssistant) Acquire(c recipeassistant.Caller) (func(), error) {
	return a.s.Limiter().Acquire(c)
}
