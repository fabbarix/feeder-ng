package recipefile_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
	"testing"

	"golang.org/x/image/webp"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

type fakeFetcher struct {
	mu    sync.Mutex
	calls []string
	byURL map[string][]byte
}

func (f *fakeFetcher) Fetch(_ context.Context, u string) ([]byte, string, error) {
	f.mu.Lock()
	f.calls = append(f.calls, u)
	f.mu.Unlock()
	if b, ok := f.byURL[u]; ok {
		return b, "image/png", nil
	}
	return nil, "", errors.New("connection refused")
}

func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	url := pngDataURL(t, w, h)
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(url, "data:image/png;base64,"))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func fileWithImages(t *testing.T, recipeImg, stepImg string) recipefile.File {
	t.Helper()
	return mustParse(t, mutate(t, func(r map[string]any) {
		recipeAt(r, 0)["image"] = recipeImg
		recipeAt(r, 0)["steps"].([]any)[1].(map[string]any)["image"] = stepImg
	}))
}

func TestResolveImagesDecodesDataURLsAndFetchesHTTPSURLs(t *testing.T) {
	ff := &fakeFetcher{byURL: map[string][]byte{"https://img.example.com/step.png": pngBytes(t, 9, 5)}}
	f := fileWithImages(t, pngDataURL(t, 20, 10), "https://img.example.com/step.png")
	set := recipefile.ResolveImages(context.Background(), f, ff)
	if len(set.Warnings) != 0 || len(set.Images) != 2 {
		t.Fatalf("set = %+v", set)
	}
	r := set.Images["$.recipes[0].image"]
	if r.Width != 20 || r.Height != 10 {
		t.Fatalf("size = %dx%d", r.Width, r.Height)
	}
	if _, err := webp.Decode(bytes.NewReader(r.WebP)); err != nil {
		t.Fatalf("stored form must be WebP: %v", err)
	}
	if s := set.Images["$.recipes[0].steps[1].image"]; s.Width != 9 || s.Height != 5 {
		t.Fatalf("step image = %dx%d", s.Width, s.Height)
	}
	if len(ff.calls) != 1 || ff.calls[0] != "https://img.example.com/step.png" {
		t.Fatalf("a data URL must not be fetched; calls = %v", ff.calls)
	}
}

func TestResolveImagesShrinksTo1600(t *testing.T) {
	f := fileWithImages(t, pngDataURL(t, 3200, 1600), pngDataURL(t, 4, 4))
	set := recipefile.ResolveImages(context.Background(), f, nil)
	if r := set.Images["$.recipes[0].image"]; r.Width != 1600 || r.Height != 800 {
		t.Fatalf("size = %dx%d, want 1600x800", r.Width, r.Height)
	}
}

func TestResolveImagesFailuresAreWarningsNotErrors(t *testing.T) {
	ff := &fakeFetcher{byURL: map[string][]byte{"https://img.example.com/notimage": []byte("<html>")}}
	cases := map[string]string{
		"download fails":         "https://img.example.com/missing.png",
		"not an image":           "https://img.example.com/notimage",
		"plain http":             "http://img.example.com/a.png",
		"corrupt data URL":       "data:image/png;base64,AAAA",
		"declared type is a lie": "data:image/jpeg;base64," + strings.TrimPrefix(pngDataURL(t, 4, 4), "data:image/png;base64,"),
	}
	for name, img := range cases {
		t.Run(name, func(t *testing.T) {
			f := fileWithImages(t, img, pngDataURL(t, 4, 4))
			set := recipefile.ResolveImages(context.Background(), f, ff)
			if len(set.Warnings) != 1 || set.Warnings[0].Path != "$.recipes[0].image" || set.Warnings[0].Code != recipefile.WarnImageFailed || set.Warnings[0].Message == "" {
				t.Fatalf("warnings = %+v", set.Warnings)
			}
			if _, ok := set.Images["$.recipes[0].image"]; ok {
				t.Fatal("a failed image must be dropped")
			}
			if _, ok := set.Images["$.recipes[0].steps[1].image"]; !ok {
				t.Fatal("the other image still works")
			}
		})
	}
}

func TestResolveImagesWithoutAFetcherRefusesURLs(t *testing.T) {
	f := fileWithImages(t, "https://img.example.com/a.png", pngDataURL(t, 4, 4))
	set := recipefile.ResolveImages(context.Background(), f, nil)
	if len(set.Warnings) != 1 || len(set.Images) != 1 {
		t.Fatalf("set = %+v", set)
	}
}

func TestResolveImagesCapsTheNumberOfDownloads(t *testing.T) {
	data := mutate(t, func(r map[string]any) {
		rec := recipeAt(r, 0)
		var steps []any
		for i := 0; i < recipefile.MaxImagesFetched+5; i++ {
			steps = append(steps, map[string]any{"text": "x", "kind": "active", "image": "https://img.example.com/s.png"})
		}
		rec["steps"] = steps
	})
	ff := &fakeFetcher{byURL: map[string][]byte{"https://img.example.com/s.png": pngBytes(t, 3, 3)}}
	set := recipefile.ResolveImages(context.Background(), mustParse(t, data), ff)
	if len(ff.calls) != recipefile.MaxImagesFetched {
		t.Fatalf("%d downloads, want %d", len(ff.calls), recipefile.MaxImagesFetched)
	}
	if len(set.Warnings) != 5 || len(set.Images) != recipefile.MaxImagesFetched {
		t.Fatalf("warnings=%d images=%d", len(set.Warnings), len(set.Images))
	}
}

func TestResolveImagesStopsWhenTheContextIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	ff := &fakeFetcher{byURL: map[string][]byte{}}
	f := fileWithImages(t, "https://img.example.com/a.png", "https://img.example.com/b.png")
	set := recipefile.ResolveImages(ctx, f, ff)
	if len(set.Warnings) != 2 || len(set.Images) != 0 {
		t.Fatalf("set = %+v", set)
	}
}
