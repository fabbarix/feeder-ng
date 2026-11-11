package recipefile_test

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"
	"math/rand"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// noisyJPEG is a w x h JPEG of random pixels (so it does not compress to nothing).
func noisyJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	r := rand.New(rand.NewSource(1))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = uint8(r.Intn(256)), uint8(r.Intn(256)), uint8(r.Intn(256)), 255
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func candidate(n int) recipefile.CandidatePhoto {
	return recipefile.CandidatePhoto{JPEG: bytes.Repeat([]byte{0xff}, n), Width: 100, Height: 100}
}

func TestNewCandidateShrinksToTheKeptSizeAndNeverUpscales(t *testing.T) {
	big, err := recipefile.NewCandidate(noisyJPEG(t, 2576, 1800))
	if err != nil {
		t.Fatal(err)
	}
	if big.Width != recipefile.CandidateMaxSide || big.Height != 1118 && big.Height != 1119 {
		t.Errorf("2576x1800 -> %dx%d, want 1600x~1118", big.Width, big.Height)
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(big.JPEG))
	if err != nil || format != "jpeg" || cfg.Width != big.Width || cfg.Height != big.Height {
		t.Errorf("candidate bytes: %v %s %+v, want a JPEG of the reported size", err, format, cfg)
	}
	small, err := recipefile.NewCandidate(noisyJPEG(t, 800, 600))
	if err != nil || small.Width != 800 || small.Height != 600 {
		t.Errorf("800x600 must stay: %+v %v", small, err)
	}
	if _, err := recipefile.NewCandidate([]byte("not an image")); err == nil {
		t.Error("garbage must be refused")
	}
}

func TestPhotosTravelWithTheReviewAndTheOwnerReadsThemByIndex(t *testing.T) {
	clk := clock.NewFake(now)
	s := recipefile.NewSessions(clk)
	rv := s.OpenWithPhotos(1, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(10), candidate(20)})
	if len(rv.Photos) != 2 {
		t.Fatalf("Review.Photos = %d, want 2", len(rv.Photos))
	}
	if p, ok := s.Photo(1, rv.ID, 1); !ok || len(p.JPEG) != 20 {
		t.Fatalf("photo 1 = %v %v", len(p.JPEG), ok)
	}
	for _, bad := range []int{-1, 2, 99} {
		if _, ok := s.Photo(1, rv.ID, bad); ok {
			t.Errorf("index %d must not exist", bad)
		}
	}
	if _, ok := s.Photo(2, rv.ID, 0); ok {
		t.Error("another User must not read the candidate photos")
	}
	if _, ok := s.Photo(1, "nope", 0); ok {
		t.Error("unknown review")
	}
}

func TestAFailedConfirmRestoresTheReviewWithItsPhotos(t *testing.T) {
	s := recipefile.NewSessions(clock.NewFake(now))
	rv := s.OpenWithPhotos(1, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(10), candidate(20)})
	taken, ok := s.Take(1, rv.ID)
	if !ok || len(taken.Photos) != 2 {
		t.Fatalf("Take must hand over the photos: %v %d", ok, len(taken.Photos))
	}
	if _, ok := s.Photo(1, rv.ID, 0); ok {
		t.Error("while taken (Confirm running) the photos are not readable")
	}
	s.Restore(taken)
	for i, n := range []int{10, 20} {
		if p, ok := s.Photo(1, rv.ID, i); !ok || len(p.JPEG) != n {
			t.Errorf("after Restore photo %d = %d %v, want %d", i, len(p.JPEG), ok, n)
		}
	}
}

func TestPhotosAreDroppedWhenTheReviewEnds(t *testing.T) {
	clk := clock.NewFake(now)
	s := recipefile.NewSessions(clk)
	open := func() recipefile.Review {
		clk.Advance(time.Second)
		return s.OpenWithPhotos(1, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(10)})
	}
	closed := open()
	s.Close(1, closed.ID)
	if _, ok := s.Photo(1, closed.ID, 0); ok {
		t.Error("Close drops the photos")
	}
	confirmed := open()
	if _, ok := s.Take(1, confirmed.ID); !ok {
		t.Fatal("take")
	}
	if _, ok := s.Photo(1, confirmed.ID, 0); ok {
		t.Error("a successful Confirm (Take without Restore) leaves no photos")
	}
	idle := open()
	clk.Advance(recipefile.SessionTTL + time.Second)
	if _, ok := s.Photo(1, idle.ID, 0); ok {
		t.Error("the idle TTL drops the photos")
	}
	first := open()
	for i := 0; i < recipefile.MaxUserReviews; i++ {
		open()
	}
	if _, ok := s.Photo(1, first.ID, 0); ok {
		t.Error("eviction past MaxUserReviews drops the photos")
	}
}

func TestFetchingAPhotoRenewsTheIdleTimerLikeGet(t *testing.T) {
	clk := clock.NewFake(now)
	s := recipefile.NewSessions(clk)
	rv := s.OpenWithPhotos(1, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(10)})
	clk.Advance(recipefile.SessionTTL - time.Minute)
	if _, ok := s.Photo(1, rv.ID, 0); !ok {
		t.Fatal("alive before the TTL")
	}
	clk.Advance(recipefile.SessionTTL - time.Minute) // renewed by Photo
	if _, ok := s.Get(1, rv.ID); !ok {
		t.Fatal("Photo renews the idle timer: a User looking at thumbnails keeps the Review")
	}
}

func TestCandidateBytesAreBoundedPerUser(t *testing.T) {
	clk := clock.NewFake(now)
	s := recipefile.NewSessions(clk)
	third := recipefile.MaxUserCandidateBytes/3 + 1 // three of these exceed the bound, two fit
	a := s.OpenWithPhotos(1, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(third)})
	clk.Advance(time.Second)
	b := s.OpenWithPhotos(1, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(third)})
	clk.Advance(time.Second)
	c := s.OpenWithPhotos(1, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(third)})
	if _, ok := s.Photo(1, a.ID, 0); ok {
		t.Error("the oldest Review loses its photos first when the User is over the bound")
	}
	if _, ok := s.Get(1, a.ID); !ok {
		t.Error("...but the Review itself stays open")
	}
	for _, rv := range []recipefile.Review{b, c} {
		if _, ok := s.Photo(1, rv.ID, 0); !ok {
			t.Error("newer Reviews keep their photos")
		}
	}
	// A Review that is over the bound on its own opens without photos.
	huge := s.OpenWithPhotos(1, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(recipefile.MaxUserCandidateBytes + 1)})
	if _, ok := s.Get(1, huge.ID); !ok {
		t.Error("the Review opens")
	}
	if _, ok := s.Photo(1, huge.ID, 0); ok {
		t.Error("its photos are dropped")
	}
	// The bound is per User.
	other := s.OpenWithPhotos(2, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(third)})
	if _, ok := s.Photo(2, other.ID, 0); !ok {
		t.Error("another User's budget is separate")
	}
	// Restore counts too: a restored Review does not smuggle photos past the bound.
	taken, _ := s.Take(1, b.ID)
	s.OpenWithPhotos(1, exampleFile(t), recipefile.ImageSet{}, []recipefile.CandidatePhoto{candidate(third)})
	s.Restore(taken)
	total := 0
	for _, id := range []string{a.ID, b.ID, c.ID, huge.ID} {
		if p, ok := s.Photo(1, id, 0); ok {
			total += len(p.JPEG)
		}
	}
	if total > recipefile.MaxUserCandidateBytes {
		t.Errorf("held %d bytes, bound is %d", total, recipefile.MaxUserCandidateBytes)
	}
}

func TestWithPhotoStoresExactlyTheChosenPhotoThroughTheNormalImagePath(t *testing.T) {
	f := exampleFile(t)
	photos := []recipefile.CandidatePhoto{}
	for _, size := range [][2]int{{200, 100}, {120, 90}} {
		c, err := recipefile.NewCandidate(noisyJPEG(t, size[0], size[1]))
		if err != nil {
			t.Fatal(err)
		}
		photos = append(photos, c)
	}
	in := recipefile.ImageSet{Images: map[string]imaging.Result{}}
	file, set, err := recipefile.WithPhoto(f, in, photos, recipefile.PhotoChoice{Index: 1, Recipe: 1})
	if err != nil {
		t.Fatal(err)
	}
	got, ok := set.Images["$.recipes[1].image"]
	if !ok || got.Width != 120 || got.Height != 90 || len(got.WebP) == 0 {
		t.Fatalf("image at recipe 1 = %+v %v, want the second photo as WebP 120x90", got, ok)
	}
	if file.Recipes[1].Image == "" {
		t.Error("the Recipe must reference its image so the plan and commit use it")
	}
	if _, other := set.Images["$.recipes[0].image"]; other || file.Recipes[0].Image != "" {
		t.Error("only the chosen Recipe gets the photo")
	}
	if len(set.Images) != 1 {
		t.Errorf("exactly one image, got %d", len(set.Images))
	}
	if len(in.Images) != 0 || f.Recipes[1].Image != "" {
		t.Error("WithPhoto must not mutate its arguments")
	}
}

func TestWithPhotoRefusesWhatCannotBeApplied(t *testing.T) {
	f := exampleFile(t)
	ph, _ := recipefile.NewCandidate(noisyJPEG(t, 50, 50))
	one := []recipefile.CandidatePhoto{ph}
	for name, tc := range map[string]struct {
		photos []recipefile.CandidatePhoto
		ch     recipefile.PhotoChoice
	}{
		"no candidates (a non-photo review)": {nil, recipefile.PhotoChoice{}},
		"negative index":                     {one, recipefile.PhotoChoice{Index: -1}},
		"index too high":                     {one, recipefile.PhotoChoice{Index: 1}},
		"negative recipe":                    {one, recipefile.PhotoChoice{Recipe: -1}},
		"recipe too high":                    {one, recipefile.PhotoChoice{Recipe: len(f.Recipes)}},
		"undecodable candidate":              {[]recipefile.CandidatePhoto{{JPEG: []byte("junk")}}, recipefile.PhotoChoice{}},
	} {
		if _, _, err := recipefile.WithPhoto(f, recipefile.ImageSet{}, tc.photos, tc.ch); !errors.Is(err, recipefile.ErrPhotoChoice) {
			t.Errorf("%s: err = %v, want ErrPhotoChoice", name, err)
		}
	}
}
