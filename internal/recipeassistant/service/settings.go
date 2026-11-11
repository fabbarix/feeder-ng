package service

import (
	"context"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/store"
)

// checkTimeout bounds the live checks of a settings save and of the models and status lookups.
const checkTimeout = 20 * time.Second

// savedKey opens the sealed key of the row. readable is false when there is no key, no secret key on the
// server, the key was sealed under another master key, or it fails to decrypt.
func (s *Service) savedKey(row store.Row) (key recipeassistant.Secret, readable bool) {
	if !row.Settings.HasKey || s.d.Box == nil || row.MasterID != s.d.MasterID {
		return "", false
	}
	pt, err := s.d.Box.Open(row.Ciphertext)
	if err != nil {
		return "", false
	}
	return recipeassistant.Secret(pt), true
}

func (s *Service) view(ctx context.Context, row store.Row) (SettingsView, error) {
	events, err := s.d.Store.Events(ctx, 20)
	if err != nil {
		return SettingsView{}, err
	}
	key, readable := s.savedKey(row)
	v := SettingsView{
		SecretKeyConfigured: s.d.Box != nil,
		Settings:            row.Settings,
		DefaultBaseURL:      recipeassistant.DefaultBaseURL,
		APIKeyReadable:      readable,
		ModelStatus:         "unknown",
		Changes:             events,
	}
	if readable && row.Settings.Enabled {
		lctx, cancel := context.WithTimeout(ctx, checkTimeout)
		defer cancel()
		info, st := s.modelInfo(lctx, func() Claude { return s.client(row.Settings.BaseURL, key) }, row.Settings.BaseURL, row.Settings.Model)
		switch st {
		case modelUnavailable:
			v.ModelStatus = "unavailable"
		case modelFound:
			v.ModelStatus, v.RetiresAt = "ok", info.RetiresAt
			if info.Lifecycle == "deprecated" {
				v.ModelStatus = "deprecated"
			}
		}
	}
	return v, nil
}

// Settings returns the Admin's view (design §7 GET /settings).
func (s *Service) Settings(ctx context.Context) (SettingsView, error) {
	row, err := s.d.Store.Load(ctx)
	if err != nil {
		return SettingsView{}, err
	}
	return s.view(ctx, row)
}

// fieldOf names the form field a settings error belongs to.
func fieldOf(code string, enabled bool) string {
	switch code {
	case recipeassistant.CodeBaseURLInvalid, recipeassistant.CodeBaseURLHasVersion:
		return "baseUrl"
	case recipeassistant.CodeModelInvalid, CodeModelUnavailable, CodeCannotRead:
		return "model"
	case recipeassistant.CodeSecretKeyMissing:
		if enabled {
			return "enabled"
		}
		return "apiKey"
	}
	return "apiKey"
}

func settingsErr(field, code string) *SettingsError {
	return &SettingsError{Errors: []FieldError{{Field: field, Code: code}}}
}

// SaveSettings applies a PUT: recipeassistant.ApplyUpdate (which refuses the saved key for another origin, the same
// rule as KeyFor), the typed key or else the readable saved key for the live check,
// Models.Get when enabled and a key is available (404 model_unavailable, 401 api_key_refused, a network
// failure or a gateway without /v1/models -> warning not_verified, a model without structured outputs
// model_cannot_read_recipes, without image input -> warning no_photos), then store.Save with sealed key.
// Errors: *SettingsError or *recipeassistant.Error.
func (s *Service) SaveSettings(ctx context.Context, actor Actor, in recipeassistant.Update) (SaveResult, error) {
	row, err := s.d.Store.Load(ctx)
	if err != nil {
		return SaveResult{}, err
	}
	applied, err := recipeassistant.ApplyUpdate(row.Settings, in, s.d.Box != nil)
	if err != nil {
		var ae *recipeassistant.Error
		if errors.As(err, &ae) {
			return SaveResult{}, settingsErr(fieldOf(ae.Code, in.Enabled), ae.Code)
		}
		return SaveResult{}, err
	}
	saved, readable := s.savedKey(row)
	key := applied.NewKey
	if key == "" && readable {
		key = saved
	}
	if applied.Settings.Enabled && key == "" {
		// The saved key exists but cannot be read here: it has to be entered again.
		return SaveResult{}, settingsErr("apiKey", recipeassistant.CodeAPIKeyRequired)
	}

	var warnings []Warning
	var info ModelInfo
	if applied.Settings.Enabled {
		lctx, cancel := context.WithTimeout(ctx, checkTimeout)
		info, err = s.client(applied.Settings.BaseURL, key).Model(lctx, applied.Settings.Model)
		cancel()
		switch code := recipeassistant.CodeOf(err); {
		case ctx.Err() != nil:
			return SaveResult{}, ctx.Err()
		case err == nil:
			switch {
			case info.Lifecycle == "retired":
				return SaveResult{}, settingsErr("model", CodeModelUnavailable)
			case !info.StructuredOutputs:
				return SaveResult{}, settingsErr("model", CodeCannotRead)
			case !info.ImageInput:
				warnings = append(warnings, Warning{Code: "no_photos"})
			}
		case code == recipeassistant.CodeModelUnavailable:
			return SaveResult{}, settingsErr("model", CodeModelUnavailable)
		case code == recipeassistant.CodeBadKey:
			return SaveResult{}, settingsErr("apiKey", CodeAPIKeyRefused)
		default:
			warnings = append(warnings, Warning{Code: "not_verified"})
		}
	}

	in2 := store.SaveInput{Settings: applied.Settings, Actor: actor, Changes: applied.Changes}
	if applied.NewKey != "" {
		sealed, err := s.d.Box.Seal([]byte(applied.NewKey.Reveal()))
		if err != nil {
			return SaveResult{}, err
		}
		in2.Key = &store.SealedKey{Ciphertext: sealed, MasterID: s.d.MasterID, Last4: applied.Settings.KeyLast4}
	}
	if err := s.d.Store.Save(ctx, in2); err != nil {
		return SaveResult{}, err
	}
	s.cache.forgetModels()
	row, err = s.d.Store.Load(ctx)
	if err != nil {
		return SaveResult{}, err
	}
	v, err := s.view(ctx, row)
	s.cache.forgetModels() // a save never leaves a lookup behind: the next status asks the API afresh
	if err != nil {
		return SaveResult{}, err
	}
	return SaveResult{View: v, Warnings: warnings, Changed: len(applied.Changes) > 0}, nil
}

// RemoveKey clears the key and turns the assistant off (recipeassistant.ApplyKeyRemoval).
func (s *Service) RemoveKey(ctx context.Context, actor Actor) (SettingsView, error) {
	row, err := s.d.Store.Load(ctx)
	if err != nil {
		return SettingsView{}, err
	}
	applied := recipeassistant.ApplyKeyRemoval(row.Settings)
	if row.Settings.HasKey {
		if err := s.d.Store.Save(ctx, store.SaveInput{Settings: applied.Settings, ClearKey: true, Actor: actor, Changes: applied.Changes}); err != nil {
			return SettingsView{}, err
		}
		s.cache.forgetModels()
		if row, err = s.d.Store.Load(ctx); err != nil {
			return SettingsView{}, err
		}
	}
	return s.view(ctx, row)
}
