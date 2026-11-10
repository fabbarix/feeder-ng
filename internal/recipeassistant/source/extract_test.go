package source_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant/source"
)

const base = "https://example.com/recipes/soup"

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "pages", name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func extract(html string) source.Page { return source.Extract([]byte(html), base) }

// lines returns the non-empty trimmed lines of the text.
func lines(s string) []string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return out
}

func node(t *testing.T, raw json.RawMessage) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("recipe node is not a JSON object: %v: %s", err, raw)
	}
	return m
}

// ---- readable text ----------------------------------------------------------

func TestTextOfAWellStructuredPage(t *testing.T) {
	p := source.Extract(fixture(t, "jsonld-graph.html"), "https://example.com/recipes/lemon-chicken")
	want := []string{
		"Lemon Chicken Traybake", "A weeknight classic.", "Ingredients",
		"- 8 chicken thighs", "- 2 lemons", "- 500 g potatoes",
		"Method", "- Heat the oven to 200C.", "- Roast for 45 minutes.",
	}
	if got := lines(p.Text); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("lines:\n got  %q\n want %q", got, want)
	}
	if p.Title != "Lemon Chicken Traybake | Example Kitchen" {
		t.Errorf("title = %q", p.Title)
	}
}

func TestSkippedElementsNeverReachTheText(t *testing.T) {
	p := source.Extract(fixture(t, "jsonld-graph.html"), "https://example.com/x")
	for _, bad := range []string{"SCRIPT-SENTINEL", "STYLE-SENTINEL", "Print", "Subscribe", "Related: Pizza", "Copyright", "Home", "Example Kitchen", "@graph", "AggregateRating"} {
		if strings.Contains(p.Text, bad) {
			t.Errorf("text contains %q:\n%s", bad, p.Text)
		}
	}
	b := source.Extract(fixture(t, "blog-noise.html"), base)
	for _, bad := range []string{"AD-SENTINEL", "NOSCRIPT-SENTINEL", "Ads: buy now", "Contact us", "Home | About"} {
		if strings.Contains(b.Text, bad) {
			t.Errorf("text contains %q:\n%s", bad, b.Text)
		}
	}
}

func TestRegionPreferenceArticleThenMainThenBody(t *testing.T) {
	both := extract(`<body><p>OUTSIDE</p><main><p>IN MAIN</p><article><p>IN ARTICLE</p></article><p>MAIN TAIL</p></main></body>`)
	if got := lines(both.Text); fmt.Sprint(got) != "[IN ARTICLE]" {
		t.Errorf("article wins: %q", got)
	}
	mainOnly := extract(`<body><p>OUTSIDE</p><main><p>IN MAIN</p></main></body>`)
	if got := lines(mainOnly.Text); fmt.Sprint(got) != "[IN MAIN]" {
		t.Errorf("main: %q", got)
	}
	bodyOnly := extract(`<html><head><title>T</title></head><body><div><p>one</p><p>two</p></div></body></html>`)
	if got := lines(bodyOnly.Text); fmt.Sprint(got) != "[one two]" {
		t.Errorf("body: %q", got)
	}
	frag := extract(`just <b>text</b> without any structure`)
	if got := lines(frag.Text); fmt.Sprint(got) != "[just text without any structure]" {
		t.Errorf("fragment: %q", got)
	}
}

func TestBlockElementsBreakLinesInlineOnesDoNot(t *testing.T) {
	p := extract(`<body><div>alpha</div><div>beta <b>bold</b><i>italic</i> gamma</div><p>para</p>one<br>two<h2>head</h2><table><tr><td>c1</td><td>c2</td></tr></table></body>`)
	want := []string{"alpha", "beta bolditalic gamma", "para", "one", "two", "head"}
	got := lines(p.Text)
	if len(got) < len(want) || fmt.Sprint(got[:len(want)]) != fmt.Sprint(want) {
		t.Fatalf("lines = %q, want it to start with %q", got, want)
	}
	if !strings.Contains(p.Text, "c1") || !strings.Contains(p.Text, "c2") {
		t.Errorf("table cells are kept: %q", p.Text)
	}
}

func TestWhitespaceIsCollapsed(t *testing.T) {
	p := extract("<body><p>  a \t\n   b   </p>\n\n\n<p></p><p>   </p><p>c</p><ul><li>  x   y </li></ul></body>")
	if strings.Contains(p.Text, "  ") || strings.Contains(p.Text, "\t") || strings.Contains(p.Text, "\n\n\n") {
		t.Errorf("not collapsed: %q", p.Text)
	}
	if p.Text != strings.TrimSpace(p.Text) {
		t.Errorf("leading or trailing whitespace: %q", p.Text)
	}
	if got := lines(p.Text); fmt.Sprint(got) != "[a b c - x y]" {
		t.Errorf("lines = %q", got)
	}
}

func TestListItemsGetADashPrefixInOrderedAndNestedLists(t *testing.T) {
	p := extract(`<body><ol><li>first</li><li>second<ul><li>nested</li></ul></li></ol></body>`)
	for _, want := range []string{"- first", "- second", "- nested"} {
		if !strings.Contains(p.Text, want) {
			t.Errorf("%q missing from %q", want, p.Text)
		}
	}
}

func TestEntitiesAreDecodedAndUnclosedMarkupIsTolerated(t *testing.T) {
	p := extract(`<body><p>Tom &amp; Jerry&#39;s &lt;3 &frac12; cup<p>unclosed <b>bold<li>item`)
	if !strings.Contains(p.Text, "Tom & Jerry's <3 ½ cup") || !strings.Contains(p.Text, "unclosed bold") || !strings.Contains(p.Text, "- item") {
		t.Errorf("text = %q", p.Text)
	}
}

func TestExtractNeverPanicsAndDoesNotTruncate(t *testing.T) {
	for name, in := range map[string][]byte{
		"empty": nil, "not html": []byte("\x00\xff\xfe binary \x01"), "only a tag": []byte("<"), "open script": []byte("<script>never closed"),
		"bad json-ld": []byte(`<script type="application/ld+json">{{{</script>`), "huge attr": []byte(`<div a="` + strings.Repeat("x", 1<<20) + `">y</div>`),
	} {
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Errorf("%s: panic %v", name, r)
				}
			}()
			_ = source.Extract(in, base)
		}()
	}
	// No truncation: the caller applies the 60,000-character rule.
	para := strings.Repeat("<p>"+strings.Repeat("word ", 40)+"</p>", 1000) // ~200,000 characters
	p := extract("<body>" + para + "</body>")
	if len(p.Text) < 190000 {
		t.Errorf("Text has %d bytes, the page text must not be truncated", len(p.Text))
	}
}

func TestExtractIsFastOnAThreeMegabytePageAndDeepNesting(t *testing.T) {
	start := time.Now()
	big := "<body>" + strings.Repeat("<div><span>text </span></div>", 3<<20/30) + "</body>"
	p := extract(big)
	deep := extract(strings.Repeat("<div>", 50000) + "core" + strings.Repeat("</div>", 50000))
	if !strings.Contains(p.Text, "text") || !strings.Contains(deep.Text, "core") {
		t.Error("content lost")
	}
	if d := time.Since(start); d > 20*time.Second {
		t.Errorf("took %v", d)
	}
}

// ---- JSON-LD ----------------------------------------------------------------

func ld(body string) string {
	return `<html><head><script type="application/ld+json">` + body + `</script></head><body><p>x</p></body></html>`
}

const soup = `{"@type":"Recipe","name":"Soup","recipeIngredient":["1 onion"],"recipeInstructions":["Cook."]}`

func TestJSONLDFromGraphWithMixedTypes(t *testing.T) {
	p := source.Extract(fixture(t, "jsonld-graph.html"), "https://example.com/recipes/lemon-chicken")
	if len(p.Recipes) != 1 {
		t.Fatalf("got %d recipe nodes, want 1 (the WebSite and BreadcrumbList are not recipes)", len(p.Recipes))
	}
	n := node(t, p.Recipes[0])
	if n["name"] != "Lemon Chicken Traybake" {
		t.Errorf("name = %v", n["name"])
	}
}

func TestJSONLDKeepsCookingFieldsAndDropsTheRest(t *testing.T) {
	p := source.Extract(fixture(t, "jsonld-graph.html"), "https://example.com/recipes/lemon-chicken")
	if len(p.Recipes) != 1 {
		t.Fatal("no recipe")
	}
	n := node(t, p.Recipes[0])
	for _, k := range []string{"name", "description", "recipeYield", "recipeIngredient", "recipeInstructions", "totalTime", "prepTime", "cookTime", "recipeCategory", "recipeCuisine", "keywords", "image", "author", "url"} {
		if _, ok := n[k]; !ok {
			t.Errorf("cooking field %q was dropped", k)
		}
	}
	for _, k := range []string{"aggregateRating", "review", "nutrition", "video", "datePublished", "publisher", "comment"} {
		if _, ok := n[k]; ok {
			t.Errorf("field %q must be dropped", k)
		}
	}
	if !source.IsComplete(p.Recipes[0]) {
		t.Error("ingredients and instructions present: complete")
	}
}

func TestJSONLDShapes(t *testing.T) {
	tests := map[string]struct {
		html string
		want int
	}{
		"single object":            {ld(soup), 1},
		"top-level array":          {ld(`[{"@type":"WebPage"},` + soup + `,` + strings.Replace(soup, "Soup", "Stew", 1) + `]`), 2},
		"@graph":                   {ld(`{"@context":"https://schema.org","@graph":[{"@type":"Organization"},` + soup + `]}`), 1},
		"@type list":               {ld(`{"@type":["Thing","Recipe"],"name":"X"}`), 1},
		"nested mainEntity":        {ld(`{"@type":"WebPage","mainEntity":` + soup + `}`), 1},
		"nested mainEntityOfPage":  {ld(`{"@type":"Article","mainEntity":{"@type":"ItemPage","mainEntity":` + soup + `}}`), 1},
		"not a recipe":             {ld(`{"@type":"Article","name":"News"}`), 0},
		"type is a substring only": {ld(`{"@type":"RecipeCollection","name":"X"}`), 0},
		"invalid block skipped, later valid one kept": {
			`<script type="application/ld+json">{oops</script><script type="application/ld+json">` + soup + `</script>`, 1},
		"two blocks": {
			`<script type="application/ld+json">` + soup + `</script><script type="application/ld+json">` + strings.Replace(soup, "Soup", "Stew", 1) + `</script>`, 2},
		"other script types ignored": {`<script type="application/json">` + soup + `</script><script>var x = ` + soup + `</script>`, 0},
		"no json-ld at all":          {`<p>nothing</p>`, 0},
		"empty block":                {`<script type="application/ld+json"></script>`, 0},
		"json scalar":                {ld(`"Recipe"`), 0},
		"deeply nested no recipe":    {ld(strings.Repeat(`{"a":`, 200) + `1` + strings.Repeat(`}`, 200)), 0},
	}
	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			if got := len(extract(tc.html).Recipes); got != tc.want {
				t.Fatalf("got %d recipe nodes, want %d", got, tc.want)
			}
		})
	}
}

func TestJSONLDScriptContentIsNotPageText(t *testing.T) {
	p := extract(ld(soup))
	if strings.Contains(p.Text, "recipeIngredient") || strings.Contains(p.Text, "onion") {
		t.Errorf("text = %q", p.Text)
	}
}

func TestIsComplete(t *testing.T) {
	for in, want := range map[string]bool{
		soup: true,
		`{"@type":"Recipe","recipeIngredient":["a"]}`:                                false,
		`{"@type":"Recipe","recipeInstructions":"Mix."}`:                             false,
		`{"@type":"Recipe","recipeIngredient":[],"recipeInstructions":["x"]}`:        false,
		`{"@type":"Recipe","recipeIngredient":["a"],"recipeInstructions":[]}`:        false,
		`{"@type":"Recipe","recipeIngredient":["a"],"recipeInstructions":"Mix."}`:    true,
		`{"@type":"Recipe","recipeIngredient":"1 egg","recipeInstructions":["Mix"]}`: true,
		`not json`: false, `[]`: false, ``: false,
	} {
		if got := source.IsComplete(json.RawMessage(in)); got != want {
			t.Errorf("IsComplete(%s) = %v, want %v", in, got, want)
		}
	}
}

// ---- images and links ---------------------------------------------------------

func TestImagesInOrderAbsoluteHTTPSDeduplicated(t *testing.T) {
	p := source.Extract(fixture(t, "jsonld-graph.html"), "https://example.com/recipes/lemon-chicken")
	want := []string{
		"https://cdn.example.com/img/hero.jpg",         // JSON-LD image (string)
		"https://cdn.example.com/img/step1.jpg",        // JSON-LD ImageObject.url
		"https://cdn.example.com/og/lemon-chicken.jpg", // og:image
		"https://example.com/img/hero.jpg",             // <img> in the content, absolutised
	}
	if fmt.Sprint(p.ImageURLs) != fmt.Sprint(want) {
		t.Fatalf("images:\n got  %q\n want %q", p.ImageURLs, want)
	}
	b := source.Extract(fixture(t, "blog-noise.html"), base)
	if fmt.Sprint(b.ImageURLs) != "[https://example.com/media/soup.jpg?w=800]" {
		t.Fatalf("http: and data: images are dropped, query kept: %q", b.ImageURLs)
	}
}

func TestImageURLsAreResolvedAgainstTheFinalURL(t *testing.T) {
	p := source.Extract([]byte(`<body><article><img src="a.jpg"><img src="../b.jpg"><img src="//cdn.example.org/c.jpg"><img src="/d.jpg"><img src="  e.jpg  "><img src=""><img></article></body>`), "https://example.com/recipes/soup")
	want := []string{"https://example.com/recipes/a.jpg", "https://example.com/b.jpg", "https://cdn.example.org/c.jpg", "https://example.com/d.jpg", "https://example.com/recipes/e.jpg"}
	if fmt.Sprint(p.ImageURLs) != fmt.Sprint(want) {
		t.Fatalf("got %q\nwant %q", p.ImageURLs, want)
	}
}

func TestImagesInSkippedRegionsAreIgnored(t *testing.T) {
	p := extract(`<body><header><img src="https://example.com/logo.png"></header><nav><img src="https://example.com/nav.png"></nav><article><img src="https://example.com/dish.png"></article><footer><img src="https://example.com/f.png"></footer></body>`)
	if fmt.Sprint(p.ImageURLs) != "[https://example.com/dish.png]" {
		t.Fatalf("got %q", p.ImageURLs)
	}
}

func TestAtMostTwentyImages(t *testing.T) {
	var sb strings.Builder
	sb.WriteString("<body><article>")
	for i := 0; i < 50; i++ {
		fmt.Fprintf(&sb, `<img src="https://example.com/i%d.jpg">`, i)
	}
	sb.WriteString("</article></body>")
	p := extract(sb.String())
	if len(p.ImageURLs) != source.MaxImages || source.MaxImages != 20 || p.ImageURLs[0] != "https://example.com/i0.jpg" || p.ImageURLs[19] != "https://example.com/i19.jpg" {
		t.Fatalf("got %d images: %q", len(p.ImageURLs), p.ImageURLs)
	}
}

func TestCanonicalURL(t *testing.T) {
	if got := source.Extract(fixture(t, "jsonld-graph.html"), "https://example.com/recipes/lemon-chicken?utm=1").CanonicalURL; got != "https://example.com/recipes/lemon-chicken" {
		t.Errorf("canonical = %q", got)
	}
	if got := extract(`<head><link rel="canonical" href="https://other.example/x"></head>`).CanonicalURL; got != "https://other.example/x" {
		t.Errorf("canonical = %q", got)
	}
	if got := extract(`<head><title>t</title></head>`).CanonicalURL; got != "" {
		t.Errorf("canonical = %q, want empty when absent", got)
	}
}

func TestTitleIsTrimmedAndDecoded(t *testing.T) {
	if got := extract("<head><title>\n  Mac &amp; Cheese \n</title></head><body>x</body>").Title; got != "Mac & Cheese" {
		t.Errorf("title = %q", got)
	}
	if got := extract("<body>x</body>").Title; got != "" {
		t.Errorf("title = %q", got)
	}
}
