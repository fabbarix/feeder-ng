// Package source extracts what the Recipe Assistant reads from a fetched web
// page: readable text, schema.org Recipe JSON-LD nodes, image URLs. Pure
// (golang.org/x/net/html, no network). See design §3.2.
package source

import (
	"bytes"
	"encoding/json"
	"net/url"
	"strings"
	"unicode"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// MaxImages is the most image URLs returned.
const MaxImages = 20

// maxLDDepth bounds the walk through a JSON-LD document.
const maxLDDepth = 32

// Page is the extraction result. Nothing is truncated here (the caller applies
// the 60,000 / 30,000 character rules).
type Page struct {
	Title        string
	Text         string
	Recipes      []json.RawMessage // schema.org Recipe nodes, cooking fields only
	ImageURLs    []string          // absolute https URLs, de-duplicated, at most MaxImages
	CanonicalURL string            // <link rel=canonical>, absolutised; "" when absent
}

// cookingFields are the Recipe properties kept; ratings, reviews, nutrition,
// video, dates and publisher data are noise for a conversion.
var cookingFields = map[string]bool{
	"@type": true, "name": true, "description": true, "recipeYield": true,
	"recipeIngredient": true, "recipeInstructions": true, "totalTime": true,
	"prepTime": true, "cookTime": true, "recipeCategory": true, "recipeCuisine": true,
	"keywords": true, "image": true, "author": true, "url": true,
	"suitableForDiet": true, "tool": true, "supply": true,
}

// skipped elements never contribute text or images.
var skipped = map[atom.Atom]bool{
	atom.Script: true, atom.Style: true, atom.Noscript: true, atom.Template: true,
	atom.Nav: true, atom.Aside: true, atom.Footer: true, atom.Form: true,
	atom.Button: true, atom.Iframe: true, atom.Svg: true, atom.Select: true,
	atom.Textarea: true, atom.Input: true, atom.Dialog: true, atom.Head: true,
}

// block elements start and end a line.
var block = map[atom.Atom]bool{
	atom.Address: true, atom.Article: true, atom.Blockquote: true,
	atom.Body: true, atom.Br: true, atom.Caption: true, atom.Details: true, atom.Dd: true,
	atom.Div: true, atom.Dl: true, atom.Dt: true, atom.Fieldset: true, atom.Figcaption: true,
	atom.Figure: true, atom.H1: true, atom.H2: true, atom.H3: true, atom.H4: true,
	atom.H5: true, atom.H6: true, atom.Header: true, atom.Hr: true, atom.Html: true,
	atom.Li: true, atom.Main: true, atom.Ol: true, atom.P: true, atom.Pre: true,
	atom.Section: true, atom.Summary: true, atom.Table: true, atom.Tbody: true,
	atom.Tfoot: true, atom.Thead: true, atom.Tr: true, atom.Ul: true,
}

// Extract reads an HTML document (already UTF-8) fetched from finalURL.
// It never panics, whatever the input.
func Extract(body []byte, finalURL string) (page Page) {
	defer func() {
		if r := recover(); r != nil {
			page = Page{}
		}
	}()
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil || doc == nil {
		// The parser refuses pathological nesting (over 512 open elements):
		// fall back to the flat tokenizer so the text is not lost.
		return Page{Text: flatText(body)}
	}
	base, _ := url.Parse(finalURL)

	var (
		title, canonical string
		ogImages         []string
		ldBlocks         []string
		article, mainEl  *html.Node
		bodyEl           *html.Node
	)
	var scan func(n *html.Node)
	scan = func(n *html.Node) {
		for c := n; c != nil; c = c.NextSibling {
			if c.Type == html.ElementNode {
				switch c.DataAtom {
				case atom.Title:
					if title == "" {
						title = collapse(textOf(c))
					}
				case atom.Link:
					if canonical == "" && hasToken(attr(c, "rel"), "canonical") {
						canonical = resolve(base, attr(c, "href"), false)
					}
				case atom.Meta:
					if strings.EqualFold(attr(c, "property"), "og:image") {
						if u := resolve(base, attr(c, "content"), true); u != "" {
							ogImages = append(ogImages, u)
						}
					}
				case atom.Script:
					t := strings.ToLower(strings.TrimSpace(attr(c, "type")))
					if t == "application/ld+json" || strings.HasPrefix(t, "application/ld+json;") {
						ldBlocks = append(ldBlocks, textOf(c))
					}
				case atom.Article:
					if article == nil {
						article = c
					}
				case atom.Main:
					if mainEl == nil {
						mainEl = c
					}
				case atom.Body:
					if bodyEl == nil {
						bodyEl = c
					}
				}
			}
			if c.FirstChild != nil {
				scan(c.FirstChild)
			}
		}
	}
	scan(doc)

	region := doc
	switch {
	case article != nil:
		region = article
	case mainEl != nil:
		region = mainEl
	case bodyEl != nil:
		region = bodyEl
	}

	w := &walker{base: base, headerSkipped: region == bodyEl || region == doc}
	w.walk(region)
	w.flush()

	recipes, ldImages := jsonLD(ldBlocks)

	var images []string
	seen := map[string]bool{}
	add := func(list []string) {
		for _, u := range list {
			u = resolve(base, u, true)
			if u == "" || seen[u] || len(images) >= MaxImages {
				continue
			}
			seen[u] = true
			images = append(images, u)
		}
	}
	add(ldImages)
	add(ogImages)
	add(w.images)

	return Page{
		Title:        title,
		Text:         strings.Join(w.lines, "\n"),
		Recipes:      recipes,
		ImageURLs:    images,
		CanonicalURL: canonical,
	}
}

// walker turns a region into lines of text and collects its images.
type walker struct {
	base          *url.URL
	headerSkipped bool // a <header> is page chrome unless the region is an article or main
	lines         []string
	cur           strings.Builder
	images        []string
}

func (w *walker) flush() {
	line := strings.TrimSpace(w.cur.String())
	w.cur.Reset()
	if line != "" && line != "-" {
		w.lines = append(w.lines, line)
	}
}

// text appends s with whitespace runs collapsed to one space.
func (w *walker) text(s string) {
	cur := w.cur.String()
	space := cur == "" || strings.HasSuffix(cur, " ") // no leading or doubled spaces
	for _, r := range s {
		if unicode.IsSpace(r) {
			if !space {
				w.cur.WriteByte(' ')
				space = true
			}
			continue
		}
		w.cur.WriteRune(r)
		space = false
	}
}

func (w *walker) walk(n *html.Node) {
	if n.Type == html.TextNode {
		w.text(n.Data)
		return
	}
	isBlock := false
	if n.Type == html.ElementNode {
		a := n.DataAtom
		if skipped[a] || (a == atom.Header && w.headerSkipped) {
			return
		}
		if a == atom.Img {
			for _, k := range []string{"src", "data-src"} {
				if u := resolve(w.base, attr(n, k), true); u != "" {
					w.images = append(w.images, u)
					break
				}
			}
			return
		}
		if isBlock = block[a]; isBlock {
			w.flush()
		}
		if a == atom.Li {
			w.cur.WriteString("- ")
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		w.walk(c)
	}
	if n.Type == html.ElementNode {
		if isBlock {
			w.flush()
		} else if n.DataAtom == atom.Td || n.DataAtom == atom.Th {
			w.text(" ") // keep table cells apart
		}
	}
}

// ---- helpers ---------------------------------------------------------------

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func hasToken(list, token string) bool {
	for _, t := range strings.Fields(strings.ToLower(list)) {
		if t == token {
			return true
		}
	}
	return false
}

// textOf concatenates the text nodes below n.
func textOf(n *html.Node) string {
	var sb strings.Builder
	var rec func(*html.Node)
	rec = func(x *html.Node) {
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.TextNode {
				sb.WriteString(c.Data)
			} else {
				rec(c)
			}
		}
	}
	rec(n)
	return sb.String()
}

func collapse(s string) string { return strings.Join(strings.Fields(s), " ") }

// resolve makes ref absolute against base. httpsOnly refuses other schemes.
func resolve(base *url.URL, ref string, httpsOnly bool) string {
	ref = strings.TrimSpace(ref)
	if ref == "" || base == nil {
		return ""
	}
	u, err := base.Parse(ref)
	if err != nil || u.Host == "" {
		return ""
	}
	if httpsOnly && u.Scheme != "https" {
		return ""
	}
	return u.String()
}

// ---- JSON-LD ---------------------------------------------------------------

// jsonLD returns the Recipe nodes of all blocks (cooking fields only,
// de-duplicated) and the image URLs they name, in order.
func jsonLD(blocks []string) ([]json.RawMessage, []string) {
	var nodes []json.RawMessage
	var images []string
	seen := map[string]bool{}
	for _, b := range blocks {
		var doc any
		if err := json.Unmarshal([]byte(strings.TrimSpace(b)), &doc); err != nil {
			continue
		}
		var found []map[string]any
		collectRecipes(doc, 0, &found)
		for _, r := range found {
			kept := map[string]any{}
			for k, v := range r {
				if cookingFields[k] {
					kept[k] = v
				}
			}
			raw, err := json.Marshal(kept)
			if err != nil || seen[string(raw)] {
				continue
			}
			seen[string(raw)] = true
			nodes = append(nodes, raw)
			images = append(images, imageRefs(r["image"], 0)...)
		}
	}
	return nodes, images
}

func collectRecipes(v any, depth int, out *[]map[string]any) {
	if depth > maxLDDepth {
		return
	}
	switch x := v.(type) {
	case []any:
		for _, e := range x {
			collectRecipes(e, depth+1, out)
		}
	case map[string]any:
		if isRecipe(x["@type"]) {
			*out = append(*out, x)
			return
		}
		for _, e := range x {
			collectRecipes(e, depth+1, out)
		}
	}
}

func isRecipe(t any) bool {
	switch x := t.(type) {
	case string:
		return x == "Recipe"
	case []any:
		for _, e := range x {
			if s, ok := e.(string); ok && s == "Recipe" {
				return true
			}
		}
	}
	return false
}

// imageRefs lists the URLs of a schema.org image value: a string, an
// ImageObject, or a list of them.
func imageRefs(v any, depth int) []string {
	if depth > 4 {
		return nil
	}
	switch x := v.(type) {
	case string:
		return []string{x}
	case []any:
		var out []string
		for _, e := range x {
			out = append(out, imageRefs(e, depth+1)...)
		}
		return out
	case map[string]any:
		if u, ok := x["url"].(string); ok {
			return []string{u}
		}
		if u, ok := x["contentUrl"].(string); ok {
			return []string{u}
		}
	}
	return nil
}

// IsComplete reports whether a Recipe node has non-empty recipeIngredient and
// recipeInstructions.
func IsComplete(node json.RawMessage) bool {
	var m map[string]any
	if err := json.Unmarshal(node, &m); err != nil {
		return false
	}
	return nonEmpty(m["recipeIngredient"]) && nonEmpty(m["recipeInstructions"])
}

func nonEmpty(v any) bool {
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x) != ""
	case []any:
		return len(x) > 0
	case map[string]any:
		return len(x) > 0
	}
	return false
}

// flatText is the structure-free fallback: text tokens outside skipped
// elements, one line per block boundary.
func flatText(body []byte) string {
	z := html.NewTokenizer(bytes.NewReader(body))
	w := &walker{}
	skip := 0
	for {
		switch z.Next() {
		case html.ErrorToken:
			w.flush()
			return strings.Join(w.lines, "\n")
		case html.TextToken:
			if skip == 0 {
				w.text(string(z.Text()))
			}
		case html.StartTagToken, html.EndTagToken, html.SelfClosingTagToken:
			tt := z.Token()
			a := atom.Lookup([]byte(tt.Data))
			if skipped[a] {
				switch tt.Type {
				case html.StartTagToken:
					skip++
				case html.EndTagToken:
					if skip > 0 {
						skip--
					}
				}
			} else if block[a] && skip == 0 {
				w.flush()
				if a == atom.Li && tt.Type == html.StartTagToken {
					w.cur.WriteString("- ")
				}
			}
		}
	}
}
