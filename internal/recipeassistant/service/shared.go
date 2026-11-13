package service

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// This file is what other reads share with the Recipe Assistant (receipt reads, docs/design/receipt-reading.md §7):
// one availability rule, one client factory, one photo preparer and one Limiter, so a receipt read and a recipe read
// together make up the Household's 30 reads an hour and one running read per User, and an Admin is exempt from both.

// Link is the assistant as another read sees it. Reason is "" when a read can start; otherwise it is why not (off,
// no_key, no_secret_key, key_unreadable or model_unavailable), and the other fields are zero.
type Link struct {
	Reason   string
	Model    string
	Client   Claude
	ImagesOK bool // the model reads images (or its capabilities are not known)
	Effort   bool // the model takes an effort setting
}

// Link reports the assistant's availability and the client, model and capabilities of one read.
func (s *Service) Link(ctx context.Context) (Link, error) {
	r, reason, err := s.availability(ctx)
	if err != nil {
		return Link{}, err
	}
	if reason != "" {
		return Link{Reason: reason}, nil
	}
	cl := s.client(r.settings.BaseURL, r.key)
	lctx, cancel := context.WithTimeout(ctx, checkTimeout)
	info, ms := s.modelInfo(lctx, func() Claude { return cl }, r.settings.BaseURL, r.settings.Model)
	cancel()
	if ms == modelUnavailable {
		return Link{Reason: "model_unavailable"}, nil
	}
	return Link{Model: r.settings.Model, Client: cl, ImagesOK: ms != modelFound || info.ImageInput, Effort: info.Effort}, nil
}

// Limiter is the one Limiter of the Recipe Assistant's reads and of the receipt reads.
func (s *Service) Limiter() *recipeassistant.Limiter { return s.limiter }

// Photos is the photo preparer the reads share (recipeassistant.PreparePhotos over the SSRF-guarded fetcher).
func (s *Service) Photos() Photos { return s.d.Photos }

// CheckDataPhoto checks one photo of a receipt read without decoding it: a data URL of a supported picture type
// within the size cap. An address is refused as unsupported (a receipt photo is sent, never fetched).
func CheckDataPhoto(p PhotoInput) error {
	if p.URL != "" {
		return invalid(CodePhotoUnsupported)
	}
	return validatePhoto(p)
}
