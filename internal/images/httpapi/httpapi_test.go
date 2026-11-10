package httpapi_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/image/webp"

	"github.com/fabbarix/feeder-ng/internal/images/httpapi"
	"github.com/fabbarix/feeder-ng/internal/recipefile/imagefetch"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

type obj = map[string]any

func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func dataURL(mime string, raw []byte) string {
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw)
}

type fakeFetcher struct {
	data  []byte
	ct    string
	err   error
	calls []string
}

func (f *fakeFetcher) Fetch(_ context.Context, u string) ([]byte, string, error) {
	f.calls = append(f.calls, u)
	return f.data, f.ct, f.err
}

func start(t *testing.T) (*testkit.Env, *testkit.Client) {
	t.Helper()
	env := testkit.Start(t)
	return env, env.LoginUser(t)
}

func mustStatus(t *testing.T, r *testkit.Response, want int) *testkit.Response {
	t.Helper()
	if r.Status != want {
		t.Fatalf("status = %d, want %d; body: %s", r.Status, want, r.Body)
	}
	return r
}

type uploaded struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

func upload(t *testing.T, c *testkit.Client, w, h int) uploaded {
	t.Helper()
	var u uploaded
	mustStatus(t, c.Post("/api/images", obj{"dataUrl": dataURL("image/png", pngBytes(t, w, h))}), 201).MustJSON(t, &u)
	return u
}

func webpSize(t *testing.T, r *testkit.Response) (int, int) {
	t.Helper()
	cfg, err := webp.DecodeConfig(bytes.NewReader(r.Body))
	if err != nil {
		t.Fatalf("response is not a WebP: %v", err)
	}
	return cfg.Width, cfg.Height
}

// ---- POST /api/images (data URL): the contract every image field uses ----

func TestUploadStoresAScaledWebPAndServesIt(t *testing.T) {
	_, c := start(t)
	u := upload(t, c, 3200, 1600)
	if len(u.ID) != 32 || u.URL != "/api/images/"+u.ID || u.Width != 1600 || u.Height != 800 {
		t.Fatalf("response = %+v, want a 32-hex id, url /api/images/<id>, 1600x800", u)
	}
	r := mustStatus(t, c.Get(u.URL), 200)
	if r.Header.Get("Content-Type") != "image/webp" || !strings.Contains(r.Header.Get("Cache-Control"), "immutable") || r.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("headers = %v", r.Header)
	}
	if w, h := webpSize(t, r); w != 1600 || h != 800 {
		t.Errorf("served %dx%d, want 1600x800", w, h)
	}
}

func TestUploadRefusals(t *testing.T) {
	_, c := start(t)
	cases := []struct {
		name   string
		body   any
		status int
		code   string
	}{
		{"text declared as png", obj{"dataUrl": dataURL("image/png", []byte("hello"))}, 422, "unsupported_image"},
		{"gif", obj{"dataUrl": dataURL("image/gif", pngBytes(t, 4, 4))}, 422, "unsupported_image"},
		{"missing dataUrl", obj{}, 422, "unsupported_image"},
		{"not JSON", "<<<", 400, "bad_request"},
		{"over 8 MB", obj{"dataUrl": dataURL("image/png", make([]byte, 9<<20))}, 413, "image_too_large"},
	}
	for _, tc := range cases {
		r := c.Post("/api/images", tc.body)
		if r.Status != tc.status || r.ErrorCode() != tc.code {
			t.Errorf("%s: %d %s, want %d %s; body %s", tc.name, r.Status, r.ErrorCode(), tc.status, tc.code, r.Body)
		}
	}
}

func TestImagesNeedASignedInUser(t *testing.T) {
	env, c := start(t)
	u := upload(t, c, 8, 8)
	anon := env.Anonymous()
	for name, r := range map[string]*testkit.Response{
		"upload":   anon.Post("/api/images", obj{"dataUrl": dataURL("image/png", pngBytes(t, 4, 4))}),
		"from-url": anon.Post("/api/images/from-url", obj{"url": "https://photos.example/a.png"}),
		"discard":  anon.Delete("/api/images/" + u.ID),
		"get":      anon.Get("/api/images/" + u.ID),
	} {
		if r.Status != 401 {
			t.Errorf("%s without signing in: %d, want 401", name, r.Status)
		}
	}
}

// ---- POST /api/images/from-url ----

func TestFromURLDownloadsConvertsAndStores(t *testing.T) {
	_, c := start(t)
	f := &fakeFetcher{data: pngBytes(t, 2400, 1200), ct: "image/png"}
	defer httpapi.UseFetcher(f)()
	var u uploaded
	mustStatus(t, c.Post("/api/images/from-url", obj{"url": "https://photos.example/soup.png"}), 201).MustJSON(t, &u)
	if len(f.calls) != 1 || f.calls[0] != "https://photos.example/soup.png" {
		t.Errorf("fetch calls = %v", f.calls)
	}
	if u.URL != "/api/images/"+u.ID || u.Width != 1600 || u.Height != 800 {
		t.Errorf("response = %+v, want the same shape as an upload, 1600x800", u)
	}
	r := mustStatus(t, c.Get(u.URL), 200)
	if r.Header.Get("Content-Type") != "image/webp" {
		t.Errorf("Content-Type = %q", r.Header.Get("Content-Type"))
	}
	if w, h := webpSize(t, r); w != 1600 || h != 800 {
		t.Errorf("served %dx%d", w, h)
	}
}

func TestFromURLBadRequests(t *testing.T) {
	_, c := start(t)
	defer httpapi.UseFetcher(&fakeFetcher{})()
	if r := c.Post("/api/images/from-url", "<<<"); r.Status != 400 || r.ErrorCode() != "bad_request" {
		t.Errorf("not JSON: %d %s", r.Status, r.ErrorCode())
	}
	for _, u := range []string{"", "not a url", "http://example.com/a.png", "https://user:pw@example.com/a.png", "ftp://example.com/a.png", "data:image/png;base64,AAAA"} {
		if r := c.Post("/api/images/from-url", obj{"url": u}); r.Status != 422 || r.ErrorCode() != "image_url_invalid" {
			t.Errorf("%q: %d %s, want 422 image_url_invalid", u, r.Status, r.ErrorCode())
		}
	}
}

// With the PRODUCTION fetcher (no override): private targets are refused before any connection is made.
func TestFromURLRefusesPrivateTargetsWithTheRealFetcher(t *testing.T) {
	_, c := start(t)
	for _, u := range []string{
		"https://127.0.0.1/a.png", "https://localhost/a.png", "https://[::1]/a.png", "https://10.0.0.8/a.png",
		"https://192.168.1.1/a.png", "https://169.254.169.254/latest/meta-data/", "https://[::ffff:10.0.0.1]/a.png", "https://0.0.0.0/a.png",
	} {
		r := c.Post("/api/images/from-url", obj{"url": u})
		if r.Status != 422 || r.ErrorCode() != "image_url_blocked" {
			t.Errorf("%s: %d %s, want 422 image_url_blocked", u, r.Status, r.ErrorCode())
		}
	}
}

func TestFromURLFetchFailures(t *testing.T) {
	_, c := start(t)
	f := &fakeFetcher{}
	defer httpapi.UseFetcher(f)()
	cases := []struct {
		name   string
		data   []byte
		err    error
		status int
		code   string
	}{
		{"private address", nil, imagefetch.ErrBlocked, 422, "image_url_blocked"},
		{"not found", nil, fmt.Errorf("%w: 404", imagefetch.ErrStatus), 502, "image_url_unreachable"},
		{"timeout", nil, context.DeadlineExceeded, 502, "image_url_unreachable"},
		{"network", nil, errors.New("connection refused"), 502, "image_url_unreachable"},
		{"download over 10 MB", nil, imagefetch.ErrTooLarge, 413, "image_too_large"},
		{"not an image type", nil, imagefetch.ErrContentType, 422, "unsupported_image"},
		{"9 MB image", bytes.Repeat([]byte{1}, 9<<20), nil, 413, "image_too_large"},
		{"text served as png", []byte("<html></html>"), nil, 422, "unsupported_image"},
	}
	for _, tc := range cases {
		f.data, f.ct, f.err = tc.data, "image/png", tc.err
		r := c.Post("/api/images/from-url", obj{"url": "https://photos.example/a.png"})
		if r.Status != tc.status || r.ErrorCode() != tc.code {
			t.Errorf("%s: %d %s, want %d %s; body %s", tc.name, r.Status, r.ErrorCode(), tc.status, tc.code, r.Body)
		}
	}
}

// ---- DELETE /api/images/{id} ----

func TestDiscardRemovesAnUnsavedUpload(t *testing.T) {
	_, c := start(t)
	u := upload(t, c, 16, 16)
	mustStatus(t, c.Delete("/api/images/"+u.ID), 204)
	mustStatus(t, c.Get(u.URL), 404)
	mustStatus(t, c.Delete("/api/images/"+u.ID), 204) // idempotent
}

func TestDiscardRefusesAnImageARecipeUses(t *testing.T) {
	_, c := start(t)
	img := upload(t, c, 16, 16)
	createRecipe(t, c, "Soup", img.ID)
	r := c.Delete("/api/images/" + img.ID)
	if r.Status != 409 || r.ErrorCode() != "image_in_use" {
		t.Fatalf("%d %s, want 409 image_in_use", r.Status, r.ErrorCode())
	}
	mustStatus(t, c.Get(img.URL), 200)
}

func TestDiscardWithAMalformedIDIs404(t *testing.T) {
	_, c := start(t)
	for _, id := range []string{"..", "not-an-id", "ABCDEF0123456789ABCDEF0123456789", "0123456789abcdef0123456789abcdef0"} {
		if r := c.Delete("/api/images/" + id); r.Status != 404 {
			t.Errorf("%q: %d, want 404", id, r.Status)
		}
	}
}

// ---- orphan cleanup: the nightly job ----

func createRecipe(t *testing.T, c *testkit.Client, name, image string) {
	t.Helper()
	var ing struct {
		ID int64 `json:"id"`
	}
	r := c.Post("/api/ingredients", obj{"name": "flour " + name, "baseUnit": "g"})
	mustStatus(t, r, 201).MustJSON(t, &ing)
	mustStatus(t, c.Post("/api/recipes", obj{
		"name": name, "yield": 2, "image": image,
		"lines": []obj{{"ingredientId": ing.ID, "quantity": 100, "unit": "g"}},
		"steps": []obj{{"text": "Cook", "kind": "active", "durationMinutes": 5}},
	}), 201)
}

func TestNightlySweepRemovesNeverSavedUploadsAndKeepsUsedAndRecentOnes(t *testing.T) {
	env, c := start(t)
	neverSaved := upload(t, c, 16, 16)
	used := upload(t, c, 16, 16)
	createRecipe(t, c, "Soup", used.ID)

	env.Clock.Set(testkit.StartTime.Add(48 * time.Hour))
	recent := upload(t, c, 16, 16) // an editor still open: inside the 24 h grace

	ran, err := env.App.Deps.Scheduler.RunDue(context.Background())
	if err != nil {
		t.Logf("RunDue: %v (another job may fail in this bare fixture; only images.sweep matters)", err)
	}
	found := false
	for _, n := range ran {
		found = found || n == "images.sweep"
	}
	if !found {
		t.Fatalf("jobs run = %v, want images.sweep among them", ran)
	}
	mustStatus(t, c.Get(neverSaved.URL), 404)
	mustStatus(t, c.Get(used.URL), 200)
	mustStatus(t, c.Get(recent.URL), 200)
}

func TestSweepKeepsAStepPhoto(t *testing.T) {
	env, c := start(t)
	stepPhoto := upload(t, c, 16, 16)
	var ing struct {
		ID int64 `json:"id"`
	}
	mustStatus(t, c.Post("/api/ingredients", obj{"name": "rice", "baseUnit": "g"}), 201).MustJSON(t, &ing)
	mustStatus(t, c.Post("/api/recipes", obj{
		"name": "Rice", "yield": 2,
		"lines": []obj{{"ingredientId": ing.ID, "quantity": 100, "unit": "g"}},
		"steps": []obj{{"text": "Boil", "kind": "active", "durationMinutes": 5, "image": stepPhoto.ID}},
	}), 201)
	env.Clock.Set(testkit.StartTime.Add(72 * time.Hour))
	_, _ = env.App.Deps.Scheduler.RunDue(context.Background())
	mustStatus(t, c.Get(stepPhoto.URL), 200)
}

// ---- HEIC/HEIF and EXIF orientation: converted by internal/imaging, same contract and limits ----

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "imaging", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestUploadConvertsAnIPhonePhotoToWebP(t *testing.T) {
	_, c := start(t)
	for _, mime := range []string{"image/heic", "image/heif"} {
		var u uploaded
		mustStatus(t, c.Post("/api/images", obj{"dataUrl": dataURL(mime, fixture(t, "pantry-128x96.heic"))}), 201).MustJSON(t, &u)
		if u.Width != 128 || u.Height != 96 || u.URL != "/api/images/"+u.ID {
			t.Errorf("%s: response = %+v, want 128x96", mime, u)
		}
		r := mustStatus(t, c.Get(u.URL), 200)
		if r.Header.Get("Content-Type") != "image/webp" {
			t.Errorf("%s: served as %q, want image/webp", mime, r.Header.Get("Content-Type"))
		}
		if w, h := webpSize(t, r); w != 128 || h != 96 {
			t.Errorf("%s: served %dx%d", mime, w, h)
		}
	}
}

func TestUploadRefusesBrokenHEICAndHEICOverTheLimits(t *testing.T) {
	_, c := start(t)
	heic := fixture(t, "pantry-128x96.heic")
	cases := []struct {
		name   string
		data   []byte
		status int
		code   string
	}{
		{"truncated", heic[:100], 422, "unsupported_image"},
		{"too many pixels", fixture(t, "too-wide-12100x64.heic"), 422, "image_too_large_pixels"},
		{"over 8 MB", append(append([]byte{}, heic...), make([]byte, 9<<20)...), 413, "image_too_large"},
	}
	for _, tc := range cases {
		r := mustStatus(t, c.Post("/api/images", obj{"dataUrl": dataURL("image/heic", tc.data)}), tc.status)
		if !strings.Contains(string(r.Body), tc.code) {
			t.Errorf("%s: body %s, want code %s", tc.name, r.Body, tc.code)
		}
	}
}

func TestFromURLConvertsAnIPhonePhoto(t *testing.T) {
	_, c := start(t)
	f := &fakeFetcher{data: fixture(t, "pantry-128x96.heic"), ct: "image/heic"}
	defer httpapi.UseFetcher(f)()
	var u uploaded
	mustStatus(t, c.Post("/api/images/from-url", obj{"url": "https://photos.example/IMG_0001.heic"}), 201).MustJSON(t, &u)
	if u.Width != 128 || u.Height != 96 {
		t.Errorf("response = %+v, want 128x96", u)
	}
	if w, h := webpSize(t, mustStatus(t, c.Get(u.URL), 200)); w != 128 || h != 96 {
		t.Errorf("served %dx%d", w, h)
	}
}

func TestUploadTurnsASidewaysPhotoUpright(t *testing.T) {
	_, c := start(t)
	var u uploaded
	mustStatus(t, c.Post("/api/images", obj{"dataUrl": dataURL("image/jpeg", fixture(t, "sideways-6.jpg"))}), 201).MustJSON(t, &u)
	if u.Width != 32 || u.Height != 64 {
		t.Fatalf("response = %+v, want the upright 32x64 (stored 64x32, EXIF orientation 6)", u)
	}
	if w, h := webpSize(t, mustStatus(t, c.Get(u.URL), 200)); w != 32 || h != 64 {
		t.Errorf("served %dx%d, want 32x64", w, h)
	}
}
