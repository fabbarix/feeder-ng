package recipeassistant_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"testing"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

func photoJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 90, A: 255})
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, nil); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func dataURL(mime string, data []byte) string {
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}

type fakeFetcher struct {
	body []byte
	err  error
	urls []string
}

func (f *fakeFetcher) Fetch(_ context.Context, u string) ([]byte, string, error) {
	f.urls = append(f.urls, u)
	return f.body, "image/jpeg", f.err
}

func wantPhotoCode(t *testing.T, err error, code string) {
	t.Helper()
	if got := ra.CodeOf(err); got != code {
		t.Errorf("code = %q (%v), want %q", got, err, code)
	}
}

func TestPreparePhotosCountMustBeOneToFour(t *testing.T) {
	d := dataURL("image/jpeg", photoJPEG(t, 40, 30))
	if _, err := ra.PreparePhotos(context.Background(), nil, nil); ra.CodeOf(err) != ra.CodePhotosEmpty {
		t.Errorf("0 photos: %v", err)
	}
	for n := 1; n <= 4; n++ {
		in := make([]ra.PhotoSource, n)
		for i := range in {
			in[i] = ra.PhotoSource{DataURL: d}
		}
		if out, err := ra.PreparePhotos(context.Background(), nil, in); err != nil || len(out) != n {
			t.Errorf("%d photos: %d, %v", n, len(out), err)
		}
	}
	five := make([]ra.PhotoSource, 5)
	for i := range five {
		five[i] = ra.PhotoSource{DataURL: d}
	}
	if _, err := ra.PreparePhotos(context.Background(), nil, five); ra.CodeOf(err) != ra.CodeTooManyPhotos {
		t.Errorf("5 photos: %v", err)
	}
}

func TestPreparePhotosShrinksToJPEGKeepingOrder(t *testing.T) {
	out, err := ra.PreparePhotos(context.Background(), nil, []ra.PhotoSource{
		{DataURL: dataURL("image/jpeg", photoJPEG(t, 3000, 2000))},
		{DataURL: dataURL("image/jpeg", photoJPEG(t, 800, 600))},
	})
	if err != nil || len(out) != 2 {
		t.Fatal(out, err)
	}
	if out[0].Width != 2576 || out[1].Width != 800 || out[1].Height != 600 {
		t.Errorf("sizes = %dx%d, %dx%d", out[0].Width, out[0].Height, out[1].Width, out[1].Height)
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(out[0].JPEG))
	if err != nil || format != "jpeg" || cfg.Width != 2576 {
		t.Errorf("output = %v %s %v", cfg, format, err)
	}
}

func TestPreparePhotosFetchesURLsThroughTheGivenFetcherAndPrepares(t *testing.T) {
	f := &fakeFetcher{body: photoJPEG(t, 640, 480)}
	out, err := ra.PreparePhotos(context.Background(), f, []ra.PhotoSource{{URL: "https://img.example/a.jpg"}})
	if err != nil || len(out) != 1 || out[0].Width != 640 || len(f.urls) != 1 || f.urls[0] != "https://img.example/a.jpg" {
		t.Fatalf("%+v %v %v", out, err, f.urls)
	}
}

func TestPreparePhotosErrorsMapToThePlansCodes(t *testing.T) {
	good := photoJPEG(t, 40, 30)
	var big bytes.Buffer
	big.Write(good)
	big.Write(make([]byte, 8<<20))
	tests := map[string]struct {
		in      ra.PhotoSource
		fetcher ra.Fetcher
		code    string
	}{
		"both set":              {ra.PhotoSource{DataURL: dataURL("image/jpeg", good), URL: "https://x.example/a.jpg"}, &fakeFetcher{}, ra.CodePhotoUnsupported},
		"neither set":           {ra.PhotoSource{}, &fakeFetcher{}, ra.CodePhotoUnsupported},
		"not a data URL":        {ra.PhotoSource{DataURL: "hello"}, nil, ra.CodePhotoUnsupported},
		"unsupported type":      {ra.PhotoSource{DataURL: dataURL("application/pdf", good)}, nil, ra.CodePhotoUnsupported},
		"bad base64":            {ra.PhotoSource{DataURL: "data:image/jpeg;base64,@@@"}, nil, ra.CodePhotoUnsupported},
		"undecodable bytes":     {ra.PhotoSource{DataURL: dataURL("image/png", []byte("not a png"))}, nil, ra.CodePhotoUnsupported},
		"declared type differs": {ra.PhotoSource{DataURL: dataURL("image/png", good)}, nil, ra.CodePhotoUnsupported},
		"over 8 MB":             {ra.PhotoSource{DataURL: dataURL("image/jpeg", big.Bytes())}, nil, ra.CodePhotoTooLarge},
		"http url":              {ra.PhotoSource{URL: "http://x.example/a.jpg"}, &fakeFetcher{body: good}, ra.CodePhotoUnavailable},
		"fetch fails":           {ra.PhotoSource{URL: "https://x.example/a.jpg"}, &fakeFetcher{err: errors.New("dial 10.0.0.1 refused")}, ra.CodePhotoUnavailable},
		"fetched body over 8MB": {ra.PhotoSource{URL: "https://x.example/a.jpg"}, &fakeFetcher{body: big.Bytes()}, ra.CodePhotoTooLarge},
		"fetched not an image":  {ra.PhotoSource{URL: "https://x.example/a.jpg"}, &fakeFetcher{body: []byte("<html>")}, ra.CodePhotoUnsupported},
		"no fetcher":            {ra.PhotoSource{URL: "https://x.example/a.jpg"}, nil, ra.CodePhotoUnavailable},
	}
	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := ra.PreparePhotos(context.Background(), tc.fetcher, []ra.PhotoSource{tc.in})
			wantPhotoCode(t, err, tc.code)
		})
	}
}

func TestPreparePhotosFetchErrorDoesNotLeakTheCause(t *testing.T) {
	f := &fakeFetcher{err: errors.New("dial tcp 10.1.2.3:443: refused")}
	_, err := ra.PreparePhotos(context.Background(), f, []ra.PhotoSource{{URL: "https://x.example/a.jpg"}})
	if err == nil || bytes.Contains([]byte(err.Error()), []byte("10.1.2.3")) {
		t.Errorf("error %v leaks the cause", err)
	}
}

func TestPreparePhotosStopsOnACancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	f := &fakeFetcher{err: ctx.Err()}
	_, err := ra.PreparePhotos(ctx, f, []ra.PhotoSource{{URL: "https://x.example/a.jpg"}})
	if !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}
