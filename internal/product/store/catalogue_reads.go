package store

import (
	"context"
	"database/sql"
	"sort"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/images"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// B9-06 catalogue reads: Prices by Shop (SET-02), the priced Product of an Ingredient before any purchase (SSP-13,
// decision SSP 5) and what Delete Shop takes with it (SAFE-02).

// ShopPriceProduct is the Product part of a Prices by Shop row. Image is the Picture's image id and ImageURL its
// address, as on a Product ("" = none).
type ShopPriceProduct struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Image    string `json:"image"`
	ImageURL string `json:"imageUrl"`
}

// ShopPrice is one row of "Prices by Shop": a Product and its latest Price at that Shop.
type ShopPrice struct {
	Product ShopPriceProduct `json:"product"`
	Price   Price            `json:"price"`
}

// productPriceSelect is productSelect's Product columns followed by one Price row's columns.
const productPriceSelect = `SELECT p.id, p.name, p.ingredient_id, i.name, i.base_unit, p.pack_size,
	CASE WHEN p.archived_at IS NULL THEN 0 ELSE 1 END, p.image, i.image,
	pr.id, pr.shop_id, pr.date, pr.price_cents, pr.price_per_kg_cents
	FROM prices pr JOIN products p ON p.id = pr.product_id JOIN ingredients i ON i.id = p.ingredient_id`

// scanProductPrice reads one productPriceSelect row.
func scanProductPrice(sc interface{ Scan(...any) error }) (Product, product.Price, error) {
	var p Product
	var pr product.Price
	var base string
	var archived int
	var ingImage string
	var cents, perKg sql.NullInt64
	err := sc.Scan(&p.ID, &p.Name, &p.IngredientID, &p.IngredientName, &base, &p.PackSize, &archived, &p.Image, &ingImage,
		&pr.ID, &pr.ShopID, &pr.Date, &cents, &perKg)
	if err != nil {
		return Product{}, product.Price{}, err
	}
	p.BaseUnit = units.Base(base)
	p.IngredientImageURL = images.URL(ingImage)
	p.ImageURL = images.URL(p.Image)
	p.Archived = archived == 1
	pr.ProductID = p.ID
	pr.PriceCents = nullInt(cents)
	pr.PricePerKgCents = nullInt(perKg)
	return p, pr, nil
}

// ShopPrices is the latest Price of each active Product at the Shop, by Product name (case-insensitive, then id). A
// Shop Barcode is not needed: every Price recorded at the Shop counts. ErrNotFound for an unknown Shop; a Shop with no
// Price has an empty, non-nil list.
func (s *Store) ShopPrices(ctx context.Context, shopID int64) ([]ShopPrice, error) {
	if err := requireShop(ctx, s.db, shopID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, productPriceSelect+` WHERE pr.shop_id = ? AND p.archived_at IS NULL
		AND pr.id = (SELECT x.id FROM prices x WHERE x.product_id = pr.product_id AND x.shop_id = pr.shop_id
			ORDER BY x.date DESC, x.id DESC LIMIT 1)`, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ShopPrice{}
	for rows.Next() {
		p, pr, err := scanProductPrice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, ShopPrice{
			Product: ShopPriceProduct{ID: p.ID, Name: p.Name, Image: p.Image, ImageURL: p.ImageURL},
			Price:   priceOut(pr, p),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := strings.ToLower(out[i].Product.Name), strings.ToLower(out[j].Product.Name)
		if a != b {
			return a < b
		}
		return out[i].Product.ID < out[j].Product.ID
	})
	return out, nil
}

// PricedPack is the Product that prices an Ingredient before any purchase, with the Price used.
type PricedPack struct {
	Product Product
	Price   Price
}

// PricedPacks answers, per Ingredient, its priced Product: an active Product with a pack Price, at the Shop when one
// is selected and has any, else at any Shop; the most recent Price, ties broken by the lowest price per Base Unit
// (product.BestPackOffer). An Ingredient with no priced Product is absent.
func (s *Store) PricedPacks(ctx context.Context, ingredientIDs []int64, shopID *int64) (map[int64]PricedPack, error) {
	out := map[int64]PricedPack{}
	if len(ingredientIDs) == 0 {
		return out, nil
	}
	marks := strings.TrimSuffix(strings.Repeat("?,", len(ingredientIDs)), ",")
	args := make([]any, 0, len(ingredientIDs))
	for _, id := range ingredientIDs {
		args = append(args, id)
	}
	rows, err := s.db.QueryContext(ctx, productPriceSelect+` WHERE p.ingredient_id IN (`+marks+`)
		AND p.archived_at IS NULL AND pr.price_cents IS NOT NULL`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type candidates struct {
		here, anywhere []product.PackOffer
	}
	byIngredient := map[int64]*candidates{}
	productOf := map[int64]Product{}
	for rows.Next() {
		p, pr, err := scanProductPrice(rows)
		if err != nil {
			return nil, err
		}
		productOf[p.ID] = p
		c := byIngredient[p.IngredientID]
		if c == nil {
			c = &candidates{}
			byIngredient[p.IngredientID] = c
		}
		offer := product.PackOffer{Price: pr, PackSize: p.PackSize}
		c.anywhere = append(c.anywhere, offer)
		if shopID != nil && pr.ShopID == *shopID {
			c.here = append(c.here, offer)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for ing, c := range byIngredient {
		best, ok := product.BestPackOffer(c.here)
		if !ok {
			best, ok = product.BestPackOffer(c.anywhere)
		}
		if !ok {
			continue
		}
		p := productOf[best.Price.ProductID]
		out[ing] = PricedPack{Product: p, Price: priceOut(best.Price, p)}
	}
	return out, nil
}

// ShopImpact is what Delete Shop takes with it (SAFE-02's confirm): its Shop Barcodes (plain and weighed), its Weight
// Barcode Rules and its Prices. Purchases keep a Shop-less record and are not counted.
type ShopImpact struct {
	ShopBarcodes       int `json:"shopBarcodes"`
	WeightBarcodeRules int `json:"weightBarcodeRules"`
	Prices             int `json:"prices"`
}

// ShopImpact counts what deleting the Shop would remove; it changes nothing. ErrNotFound for an unknown Shop.
func (s *Store) ShopImpact(ctx context.Context, shopID int64) (ShopImpact, error) {
	if err := requireShop(ctx, s.db, shopID); err != nil {
		return ShopImpact{}, err
	}
	var out ShopImpact
	err := s.db.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM shop_barcodes WHERE shop_id = ?),
		(SELECT COUNT(*) FROM weight_barcode_rules WHERE shop_id = ?),
		(SELECT COUNT(*) FROM prices WHERE shop_id = ?)`, shopID, shopID, shopID).
		Scan(&out.ShopBarcodes, &out.WeightBarcodeRules, &out.Prices)
	return out, err
}
