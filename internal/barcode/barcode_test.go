package barcode

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type vectors struct {
	Normalise []struct {
		Name   string  `json:"name"`
		Raw    string  `json:"raw"`
		Format Format  `json:"format"`
		Expect Scanned `json:"expect"`
	} `json:"normalise"`
	Rules []struct {
		Name  string     `json:"name"`
		Rule  WeightRule `json:"rule"`
		Valid bool       `json:"valid"`
	} `json:"rules"`
	Catalogs map[string]Catalog `json:"catalogs"`
	Resolve  []struct {
		Name    string     `json:"name"`
		Catalog string     `json:"catalog"`
		Raw     string     `json:"raw"`
		Format  Format     `json:"format"`
		Expect  Resolution `json:"expect"`
	} `json:"resolve"`
	Price struct {
		FromWeight []struct {
			PriceCents int     `json:"priceCents"`
			Grams      float64 `json:"grams"`
			Expect     struct {
				OK              bool `json:"ok"`
				PricePerKgCents int  `json:"pricePerKgCents"`
			} `json:"expect"`
		} `json:"fromWeight"`
		WeightFromPrice []struct {
			PriceCents      int `json:"priceCents"`
			PricePerKgCents int `json:"pricePerKgCents"`
			Expect          struct {
				OK    bool `json:"ok"`
				Grams int  `json:"grams"`
			} `json:"expect"`
		} `json:"weightFromPrice"`
	} `json:"price"`
}

func load(t *testing.T) vectors {
	t.Helper()
	b, err := os.ReadFile("testdata/vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	dec := json.NewDecoder(bytes.NewReader(b))
	// unknown top-level keys such as "_comment" are tolerated on purpose
	if err := dec.Decode(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestParse(t *testing.T) {
	for _, c := range load(t).Normalise {
		t.Run(c.Name, func(t *testing.T) {
			if got := Parse(c.Raw, c.Format); !reflect.DeepEqual(got, c.Expect) {
				t.Errorf("Parse(%q, %q) = %+v, want %+v", c.Raw, c.Format, got, c.Expect)
			}
		})
	}
}

func TestCanonical(t *testing.T) {
	cases := []struct {
		raw  string
		code string
		ok   bool
	}{
		{"4006381333931", "04006381333931", true},
		{" 036000291452 ", "00036000291452", true},
		{"SHOP-42", "SHOP-42", true},
		{"4006381333932", "", false},
		{"", "", false},
	}
	for _, c := range cases {
		code, ok := Canonical(c.raw)
		if code != c.code || ok != c.ok {
			t.Errorf("Canonical(%q) = %q, %v; want %q, %v", c.raw, code, ok, c.code, c.ok)
		}
	}
}

func TestWeightRuleValidate(t *testing.T) {
	for _, c := range load(t).Rules {
		t.Run(c.Name, func(t *testing.T) {
			err := c.Rule.Validate()
			if c.Valid && err != nil {
				t.Errorf("want valid, got %v", err)
			}
			if !c.Valid && err == nil {
				t.Error("want an error, got nil")
			}
		})
	}
}

func TestWeightItemKey(t *testing.T) {
	if got := WeightItemKey(2, "54321"); got != "2:54321" {
		t.Errorf("got %q", got)
	}
}

func TestResolve(t *testing.T) {
	v := load(t)
	for _, c := range v.Resolve {
		t.Run(c.Name, func(t *testing.T) {
			cat, ok := v.Catalogs[c.Catalog]
			if !ok {
				t.Fatalf("unknown catalog %q", c.Catalog)
			}
			got := Resolve(Parse(c.Raw, c.Format), cat)
			if !reflect.DeepEqual(got, c.Expect) {
				t.Errorf("got %+v, want %+v", got, c.Expect)
			}
		})
	}
}

func TestPriceHelpers(t *testing.T) {
	v := load(t)
	for _, c := range v.Price.FromWeight {
		got, ok := PricePerKgFromWeight(c.PriceCents, c.Grams)
		if ok != c.Expect.OK || (ok && got != c.Expect.PricePerKgCents) {
			t.Errorf("PricePerKgFromWeight(%d, %v) = %d, %v; want %+v", c.PriceCents, c.Grams, got, ok, c.Expect)
		}
	}
	for _, c := range v.Price.WeightFromPrice {
		got, ok := WeightFromPrice(c.PriceCents, c.PricePerKgCents)
		if ok != c.Expect.OK || (ok && got != c.Expect.Grams) {
			t.Errorf("WeightFromPrice(%d, %d) = %d, %v; want %+v", c.PriceCents, c.PricePerKgCents, got, ok, c.Expect)
		}
	}
}

// The ask_weight round trip from the spec: the user gives a weight once, the
// price per kg derived from it makes the next price-valued scan resolvable.
func TestAskWeightRoundTrip(t *testing.T) {
	v := load(t)
	cat := v.Catalogs["shopA"]
	r := Resolve(Parse("2299999005006", FormatEAN13), cat)
	if r.Outcome != OutcomeAskWeight {
		t.Fatalf("outcome = %s", r.Outcome)
	}
	ppk, ok := PricePerKgFromWeight(r.PriceCents, 400) // 500 cents for 400 g
	if !ok || ppk != 1250 {
		t.Fatalf("ppk = %d, %v", ppk, ok)
	}
	cat.PricePerKgCents = map[int64]int{r.ProductID: ppk}
	again := Resolve(Parse("2299999005006", FormatEAN13), cat)
	if again.Outcome != OutcomeWeighed || again.WeightGrams != 400 || again.PricePerKgCents != 1250 {
		t.Errorf("got %+v", again)
	}
}
