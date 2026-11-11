package refs_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/images/refs"
)

// PP: a Product Picture is an image id too. If products.image is missing from Default, the nightly sweep deletes the picture
// 24 hours after it was saved, and Guarded would let another record kind delete a file a Product still shows.
func TestDefaultKeepsProductPictures(t *testing.T) {
	d := openDB(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	have := map[refs.Column]bool{}
	for _, c := range refs.Default {
		have[c] = true
	}
	if !have[(refs.Column{Table: "products", Column: "image"})] {
		t.Errorf("refs.Default lacks products.image: %+v", refs.Default)
	}
	const pic = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	exec(t, d, `INSERT INTO ingredients (name, name_key, base_unit, created_at, updated_at) VALUES ('Passata', 'passata', 'g', 'x', 'x')`)
	exec(t, d, `INSERT INTO products (name, ingredient_id, pack_size, image, created_at, updated_at) VALUES ('Mutti', 1, 700, ?, 'x', 'x')`, pic)
	c := refs.New(d)
	got, err := c.ReferencedIDs(context.Background())
	if err != nil || !got[pic] {
		t.Errorf("ids = %v, err = %v; a Product picture must be referenced", got, err)
	}
	if used, err := c.IsReferenced(context.Background(), pic); err != nil || !used {
		t.Errorf("IsReferenced = %v, %v; Guarded deletes depend on it", used, err)
	}
}
