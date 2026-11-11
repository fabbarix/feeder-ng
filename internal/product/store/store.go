// Package store persists Shops, Products, Shop Barcodes, Weight Barcode Rules,
// Prices and purchases in SQLite and builds the barcode Catalog.
// See docs/dev/design/t9-products-shops.md.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/images"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var (
	ErrNotFound          = errors.New("not found")
	ErrNameTaken         = errors.New("name taken")
	ErrInUse             = errors.New("in use")
	ErrDuplicatePrefix   = errors.New("duplicate prefix")
	ErrUnknownIngredient = errors.New("unknown ingredient")
	// ErrBought: the Product was bought (or Stock refers to it), so it cannot be
	// deleted; archive it instead (SetArchived). errors.Is(ErrBought, ErrInUse).
	ErrBought = fmt.Errorf("product was bought, archive it instead: %w", ErrInUse)
)

// BarcodeTakenError: the code already belongs to ProductID (global), or is
// already a Shop Barcode of that Shop (ProductID = its Product).
type BarcodeTakenError struct {
	Code      string
	ProductID int64
	// Archived: the owner is an archived Product. It still owns its barcodes; the
	// caller offers to unarchive it instead of creating a duplicate.
	Archived bool
}

func (e *BarcodeTakenError) Error() string {
	return fmt.Sprintf("barcode already belongs to product %d", e.ProductID)
}

// Shop is a place the Household buys from.
type Shop struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	// Location is the Shop Location; nil (JSON null) = not saved.
	Location *product.Location `json:"location"`
}

// Rule is a Weight Barcode Rule of a Shop.
type Rule struct {
	barcode.WeightRule
	ShopID int64 `json:"shopId"`
}

// Product summary.
type Product struct {
	ID             int64      `json:"id"`
	Name           string     `json:"name"`
	IngredientID   int64      `json:"ingredientId"`
	IngredientName string     `json:"ingredientName"`
	BaseUnit       units.Base `json:"baseUnit"`
	PackSize       float64    `json:"packSize"`
	Archived       bool       `json:"archived"`
	// Image is the Picture's image id ("" = none) and ImageURL its address "/api/images/<id>" ("" = none); both are always sent (PP).
	Image    string `json:"image"`
	ImageURL string `json:"imageUrl"`
	// IngredientImageURL is the Ingredient's Picture address (PE; for scan feedback, not part of the Product JSON).
	IngredientImageURL string `json:"-"`
}

// ShopBarcode as stored.
type ShopBarcode struct {
	ID        int64  `json:"id"`
	ShopID    int64  `json:"shopId"`
	ProductID int64  `json:"productId"`
	Code      string `json:"code,omitempty"`
	RuleID    int64  `json:"ruleId,omitempty"`
	ItemCode  string `json:"itemCode,omitempty"`
}

// Price as served: PricePerKgCents is explicit or derived (PricePerKgDerived).
type Price struct {
	ID                int64  `json:"id"`
	ProductID         int64  `json:"productId"`
	ShopID            int64  `json:"shopId"`
	Date              string `json:"date"`
	PriceCents        *int   `json:"priceCents"`
	PricePerKgCents   *int   `json:"pricePerKgCents"`
	PricePerKgDerived bool   `json:"pricePerKgDerived"`
}

// Detail is a Product with everything attached to it.
type Detail struct {
	Product
	Barcodes     []string      `json:"barcodes"`     // canonical, sorted
	Shops        []Shop        `json:"shops"`        // known to sell it
	ShopBarcodes []ShopBarcode `json:"shopBarcodes"` // plain and weighed, by id
	LatestPrices []Price       `json:"latestPrices"` // one per Shop, by shop name
}

// NewProduct is the atomic create (global barcodes and Shop Barcodes in one go).
type NewProduct struct {
	product.Input
	Barcodes     []string // raw, canonicalised by the store
	ShopBarcodes []NewShopBarcode
}

// NewShopBarcode: plain when Code is set, weighed when RuleID and ItemCode are.
type NewShopBarcode struct {
	ShopID   int64
	Code     string
	RuleID   int64
	ItemCode string
}

// Filter for Products. Zero values do not filter. Barcode is raw and canonicalised.
type Filter struct {
	Query        string // normalised substring of the name
	IngredientID int64
	Barcode      string
	// IncludeArchived lists archived Products too (default: active only).
	IncludeArchived bool
}

// Resolved is the outcome of Store.Resolve.
type Resolved struct {
	Resolution barcode.Resolution `json:"resolution"`
	Product    *Product           `json:"product"`
	// ArchivedProduct is set when the resolution is unknown (or an unknown weighed
	// Shop Barcode) only because the code belongs to an archived Product.
	ArchivedProduct *Product `json:"archivedProduct"`
}

// UsageCounter reports how many rows of another feature reference a Product.
type UsageCounter func(ctx context.Context, q Querier, productID int64) (int, error)

// Querier is satisfied by *sql.DB and *sql.Tx.
type Querier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// execer is what the internal helpers need: *sql.DB and *sql.Tx both have it.
type execer interface {
	Querier
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

var (
	usageMu sync.Mutex
	usages  = map[string]UsageCounter{}
)

// RegisterUsage registers a UsageCounter (call from init()); a Product with a
// non-zero count cannot be deleted (ErrInUse). Panics on empty or duplicate name.
func RegisterUsage(name string, f UsageCounter) {
	usageMu.Lock()
	defer usageMu.Unlock()
	if name == "" {
		panic("store: usage counter with empty name")
	}
	if _, dup := usages[name]; dup {
		panic("store: duplicate usage counter " + name)
	}
	usages[name] = f
}

func allUsages() []UsageCounter {
	usageMu.Lock()
	defer usageMu.Unlock()
	out := make([]UsageCounter, 0, len(usages))
	for _, f := range usages {
		out = append(out, f)
	}
	return out
}

// Store is the SQLite-backed store.
type Store struct {
	db     *sql.DB
	clk    clock.Clock
	images Images
}

func New(d *sql.DB, clk clock.Clock, opts ...Option) *Store {
	s := &Store{db: d, clk: clk}
	for _, o := range opts {
		o(s)
	}
	return s
}

// Images is the part of the image store the Product Store needs (PP): the same two methods as ingredient/store.Images.
// Production passes images.NewGuarded(files, refs.New(db)), so Delete never removes a file some record still uses.
type Images interface {
	Exists(id string) bool
	Delete(ctx context.Context, id string) error
}

// Option configures a Store.
type Option func(*Store)

// WithImages makes the Store refuse a Picture that was never uploaded (a *product.ValidationError on field "image") and
// delete a file no Product uses any more after it is replaced, cleared, or its Product deleted.
func WithImages(im Images) Option { return func(s *Store) { s.images = im } }

// SetImage sets (id), replaces or clears ("") the Picture of a Product, then deletes the replaced file when no Product uses it.
// ErrNotFound for an unknown Product, a *product.ValidationError on field "image" for a malformed or never-uploaded id.
func (s *Store) SetImage(ctx context.Context, id int64, image string) (Detail, error) {
	image = strings.TrimSpace(image)
	if err := s.checkImage(image); err != nil {
		return Detail{}, err
	}
	var old string
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		if err := tx.QueryRowContext(ctx, `SELECT image FROM products WHERE id = ?`, id).Scan(&old); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE products SET image=?, updated_at=? WHERE id=?`, image, s.now(), id)
		return err
	})
	if err != nil {
		return Detail{}, err
	}
	if old != image {
		s.dropUnreferenced(ctx, old)
	}
	return s.Product(ctx, id)
}

// FillImage (PPX) gives the Product a Picture only when it has none, atomically (UPDATE ... WHERE image is empty), and
// reports whether it did. A Product that already has a Picture is left alone (false, nil), as is image == "".
// A well-formed id with no stored file is *product.ValidationError{Field: "image", Err: product.ErrPictureMissing};
// an unknown Product is ErrNotFound. It never deletes a file.
func (s *Store) FillImage(ctx context.Context, id int64, image string) (bool, error) {
	image = strings.TrimSpace(image)
	if image == "" {
		return false, nil
	}
	if err := s.checkImage(image); err != nil {
		return false, err
	}
	res, err := s.db.ExecContext(ctx, `UPDATE products SET image=?, updated_at=? WHERE id=? AND image=''`, image, s.now(), id)
	if err != nil {
		return false, err
	}
	if n, err := res.RowsAffected(); err != nil {
		return false, err
	} else if n == 1 {
		return true, nil
	}
	var one int
	if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM products WHERE id = ?`, id).Scan(&one); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, ErrNotFound
		}
		return false, err
	}
	return false, nil
}

// checkImage refuses a Picture id that is malformed or was never uploaded (the upload check only when WithImages was given).
func (s *Store) checkImage(id string) error {
	if id == "" {
		return nil
	}
	if !imaging.ValidID(id) {
		return &product.ValidationError{Field: "image", Message: "The picture was not uploaded"}
	}
	if s.images != nil && !s.images.Exists(id) {
		// PPX: a well-formed id with no stored file is the typed missing-Picture error (errors.Is ErrPictureMissing).
		return &product.ValidationError{Field: "image", Message: "The picture was not uploaded", Err: product.ErrPictureMissing}
	}
	return nil
}

// dropUnreferenced deletes the file of a Picture no Product uses any more (best effort, after the commit).
func (s *Store) dropUnreferenced(ctx context.Context, id string) {
	if id == "" || s.images == nil {
		return
	}
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE image = ?`, id).Scan(&n); err != nil || n > 0 {
		return
	}
	_ = s.images.Delete(ctx, id)
}

func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

// withTx runs fn in one transaction, rolling back on any error.
func (s *Store) withTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func isUnique(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

// exists reports whether a row with id is in table.
func exists(ctx context.Context, q Querier, table string, id int64) (bool, error) {
	var n int
	err := q.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table+" WHERE id = ?", id).Scan(&n)
	return n > 0, err
}

func requireShop(ctx context.Context, q Querier, id int64) error {
	ok, err := exists(ctx, q, "shops", id)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

func requireProduct(ctx context.Context, q Querier, id int64) error {
	ok, err := exists(ctx, q, "products", id)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

// ---- Shops ----

func shopKey(name string) string { return units.NormalizeName(product.NormalizeName(name)) }

// CreateShop: ErrNameTaken when the normalised name exists; *product.ValidationError.
// CreateShop adds a Shop; loc is its Shop Location, nil = not saved.
func (s *Store) CreateShop(ctx context.Context, name string, loc *product.Location) (Shop, error) {
	if err := product.ValidateShopName(name); err != nil {
		return Shop{}, err
	}
	if loc != nil {
		if err := product.ValidateLocation(*loc); err != nil {
			return Shop{}, err
		}
	}
	clean := product.NormalizeName(name)
	lat, lon := locationArgs(loc)
	res, err := s.db.ExecContext(ctx, `INSERT INTO shops(name, name_key, created_at, lat, lon) VALUES (?, ?, ?, ?, ?)`,
		clean, shopKey(clean), s.now(), lat, lon)
	if isUnique(err) {
		return Shop{}, ErrNameTaken
	}
	if err != nil {
		return Shop{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Shop{}, err
	}
	return Shop{ID: id, Name: clean, Location: loc}, nil
}

// SetShopLocation saves where the Shop is, replacing any earlier Shop Location.
func (s *Store) SetShopLocation(ctx context.Context, id int64, loc product.Location) (Shop, error) {
	if err := product.ValidateLocation(loc); err != nil {
		return Shop{}, err
	}
	res, err := s.db.ExecContext(ctx, `UPDATE shops SET lat = ?, lon = ? WHERE id = ?`, loc.Lat, loc.Lon, id)
	if err != nil {
		return Shop{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Shop{}, ErrNotFound
	}
	return s.Shop(ctx, id)
}

// locationArgs gives the lat and lon column values; nil gives SQL NULLs.
func locationArgs(loc *product.Location) (any, any) {
	if loc == nil {
		return nil, nil
	}
	return loc.Lat, loc.Lon
}

// scanShop reads id, name, lat, lon.
func scanShop(sc interface{ Scan(...any) error }) (Shop, error) {
	var sh Shop
	var lat, lon sql.NullFloat64
	if err := sc.Scan(&sh.ID, &sh.Name, &lat, &lon); err != nil {
		return Shop{}, err
	}
	if lat.Valid && lon.Valid {
		sh.Location = &product.Location{Lat: lat.Float64, Lon: lon.Float64}
	}
	return sh, nil
}

func (s *Store) RenameShop(ctx context.Context, id int64, name string) (Shop, error) {
	if err := product.ValidateShopName(name); err != nil {
		return Shop{}, err
	}
	clean := product.NormalizeName(name)
	res, err := s.db.ExecContext(ctx, `UPDATE shops SET name = ?, name_key = ? WHERE id = ?`, clean, shopKey(clean), id)
	if isUnique(err) {
		return Shop{}, ErrNameTaken
	}
	if err != nil {
		return Shop{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Shop{}, ErrNotFound
	}
	return s.Shop(ctx, id)
}

func (s *Store) Shop(ctx context.Context, id int64) (Shop, error) {
	sh, err := scanShop(s.db.QueryRowContext(ctx, `SELECT id, name, lat, lon FROM shops WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Shop{}, ErrNotFound
	}
	return sh, err
}

// Shops is ordered by normalised name.
func (s *Store) Shops(ctx context.Context) ([]Shop, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, lat, lon FROM shops ORDER BY name_key, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Shop{}
	for rows.Next() {
		sh, err := scanShop(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sh)
	}
	return out, rows.Err()
}

// DeleteShop removes its barcodes, rules and Prices; purchases keep a NULL Shop.
func (s *Store) DeleteShop(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM shops WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ---- Weight Barcode Rules ----

const ruleColumns = `id, shop_id, prefix, item_start, item_length, value_start, value_length, value_kind, value_unit, decimal_places`

func scanRule(sc interface{ Scan(...any) error }) (Rule, error) {
	var r Rule
	var kind, unit string
	err := sc.Scan(&r.ID, &r.ShopID, &r.Prefix, &r.Item.Start, &r.Item.Length, &r.Value.Start, &r.Value.Length, &kind, &unit, &r.DecimalPlaces)
	r.ValueKind = barcode.ValueKind(kind)
	r.ValueUnit = barcode.ValueUnit(unit)
	return r, err
}

// validRule validates r and returns the error wrapped for the API.
func validRule(r barcode.WeightRule) error {
	if err := r.Validate(); err != nil {
		return &product.ValidationError{Field: "rule", Message: err.Error()}
	}
	return nil
}

func loadRule(ctx context.Context, q Querier, id int64) (Rule, error) {
	r, err := scanRule(q.QueryRowContext(ctx, `SELECT `+ruleColumns+` FROM weight_barcode_rules WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Rule{}, ErrNotFound
	}
	return r, err
}

// CreateRule validates with barcode.WeightRule.Validate (error wrapped as
// *product.ValidationError{Field:"rule"}); ErrDuplicatePrefix; ErrNotFound (Shop).
// The ID of the argument is ignored.
func (s *Store) CreateRule(ctx context.Context, shopID int64, r barcode.WeightRule) (Rule, error) {
	if err := requireShop(ctx, s.db, shopID); err != nil {
		return Rule{}, err
	}
	if err := validRule(r); err != nil {
		return Rule{}, err
	}
	var out Rule
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `INSERT INTO weight_barcode_rules(shop_id, prefix, item_start, item_length, value_start, value_length, value_kind, value_unit, decimal_places)
			VALUES (?,?,?,?,?,?,?,?,?)`,
			shopID, r.Prefix, r.Item.Start, r.Item.Length, r.Value.Start, r.Value.Length, string(r.ValueKind), string(r.ValueUnit), r.DecimalPlaces)
		if isUnique(err) {
			return ErrDuplicatePrefix
		}
		if err != nil {
			return err
		}
		id, err := res.LastInsertId()
		if err != nil {
			return err
		}
		out, err = loadRule(ctx, tx, id)
		return err
	})
	return out, err
}

// UpdateRule replaces the rule. ErrInUse when Item.Length changes while weighed
// Shop Barcodes use it; ErrDuplicatePrefix.
func (s *Store) UpdateRule(ctx context.Context, id int64, r barcode.WeightRule) (Rule, error) {
	var out Rule
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		cur, err := loadRule(ctx, tx, id)
		if err != nil {
			return err
		}
		if err := validRule(r); err != nil {
			return err
		}
		if r.Item.Length != cur.Item.Length {
			var n int
			if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM shop_barcodes WHERE rule_id = ?`, id).Scan(&n); err != nil {
				return err
			}
			if n > 0 {
				return ErrInUse
			}
		}
		_, err = tx.ExecContext(ctx, `UPDATE weight_barcode_rules SET prefix=?, item_start=?, item_length=?, value_start=?, value_length=?, value_kind=?, value_unit=?, decimal_places=? WHERE id=?`,
			r.Prefix, r.Item.Start, r.Item.Length, r.Value.Start, r.Value.Length, string(r.ValueKind), string(r.ValueUnit), r.DecimalPlaces, id)
		if isUnique(err) {
			return ErrDuplicatePrefix
		}
		if err != nil {
			return err
		}
		out, err = loadRule(ctx, tx, id)
		return err
	})
	return out, err
}

// DeleteRule also deletes the weighed Shop Barcodes of the rule.
func (s *Store) DeleteRule(ctx context.Context, id int64) error {
	return s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := loadRule(ctx, tx, id); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM shop_barcodes WHERE rule_id = ?`, id); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM weight_barcode_rules WHERE id = ?`, id)
		return err
	})
}

// Rules of a Shop, by id. ErrNotFound for an unknown Shop.
func (s *Store) Rules(ctx context.Context, shopID int64) ([]Rule, error) {
	if err := requireShop(ctx, s.db, shopID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT `+ruleColumns+` FROM weight_barcode_rules WHERE shop_id = ? ORDER BY id`, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Rule{}
	for rows.Next() {
		r, err := scanRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ---- Products ----

const productSelect = `SELECT p.id, p.name, p.ingredient_id, i.name, i.base_unit, p.pack_size,
	CASE WHEN p.archived_at IS NULL THEN 0 ELSE 1 END, p.image, i.image
	FROM products p JOIN ingredients i ON i.id = p.ingredient_id`

func scanProduct(sc interface{ Scan(...any) error }) (Product, error) {
	var p Product
	var base string
	var archived int
	var ingImage string
	err := sc.Scan(&p.ID, &p.Name, &p.IngredientID, &p.IngredientName, &base, &p.PackSize, &archived, &p.Image, &ingImage)
	p.BaseUnit = units.Base(base)
	p.IngredientImageURL = images.URL(ingImage)
	p.ImageURL = images.URL(p.Image)
	p.Archived = archived == 1
	return p, err
}

// isArchived reports whether the Product exists and is archived.
func isArchived(ctx context.Context, q Querier, id int64) (bool, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT CASE WHEN archived_at IS NULL THEN 0 ELSE 1 END FROM products WHERE id = ?`, id).Scan(&n)
	return n == 1, err
}

func loadProduct(ctx context.Context, q Querier, id int64) (Product, error) {
	p, err := scanProduct(q.QueryRowContext(ctx, productSelect+` WHERE p.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Product{}, ErrNotFound
	}
	return p, err
}

// CreateProduct validates, canonicalises barcodes, and writes the Product, its
// global barcodes, its Shop Barcodes and the "sold at" links of those Shops in one
// transaction. ErrUnknownIngredient, *BarcodeTakenError, ErrNotFound (a Shop or
// rule), product.ErrInvalidBarcode / ErrInvalidItemCode / ErrInvalid.
func (s *Store) CreateProduct(ctx context.Context, in NewProduct) (Detail, error) {
	if err := in.Input.Validate(); err != nil {
		return Detail{}, err
	}
	codes, err := canonicalList(in.Barcodes)
	if err != nil {
		return Detail{}, err
	}
	image := strings.TrimSpace(in.Image)
	var id int64
	err = s.withTx(ctx, func(tx *sql.Tx) error {
		var ok bool
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) > 0 FROM ingredients WHERE id = ?`, in.IngredientID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return ErrUnknownIngredient
		}
		name := product.NormalizeName(in.Name)
		res, err := tx.ExecContext(ctx, `INSERT INTO products(name, ingredient_id, pack_size, image, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
			name, in.IngredientID, in.PackSize, image, s.now(), s.now())
		if err != nil {
			return err
		}
		if id, err = res.LastInsertId(); err != nil {
			return err
		}
		for _, code := range codes {
			if err := addGlobalBarcode(ctx, tx, id, code); err != nil {
				return err
			}
		}
		for _, sb := range in.ShopBarcodes {
			if _, err := addShopBarcode(ctx, tx, sb.ShopID, id, sb.Code, sb.RuleID, sb.ItemCode); err != nil {
				return err
			}
		}
		// After the barcode checks, so a taken barcode is reported (and merged by a scan) before a missing Picture.
		return s.checkImage(image)
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Product(ctx, id)
}

// canonicalList canonicalises raw barcodes and drops duplicates, keeping order.
func canonicalList(raw []string) ([]string, error) {
	seen := map[string]bool{}
	var out []string
	for _, r := range raw {
		code, err := product.NormalizeBarcode(r)
		if err != nil {
			return nil, err
		}
		if !seen[code] {
			seen[code] = true
			out = append(out, code)
		}
	}
	return out, nil
}

// takenBy is the BarcodeTakenError for a code owned by another Product, flagging an archived owner.
func takenBy(ctx context.Context, q Querier, code string, owner int64) error {
	archived, err := isArchived(ctx, q, owner)
	if err != nil {
		return err
	}
	return &BarcodeTakenError{Code: code, ProductID: owner, Archived: archived}
}

// addGlobalBarcode adds a global barcode; *BarcodeTakenError when another Product owns it.
func addGlobalBarcode(ctx context.Context, tx *sql.Tx, productID int64, code string) error {
	var owner int64
	err := tx.QueryRowContext(ctx, `SELECT product_id FROM product_barcodes WHERE code = ?`, code).Scan(&owner)
	if err == nil {
		if owner == productID {
			return nil
		}
		return takenBy(ctx, tx, code, owner)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO product_barcodes(code, product_id) VALUES (?, ?)`, code, productID)
	return err
}

// addShopBarcode validates a Shop Barcode (plain or weighed), checks the Shop,
// product and rule, inserts it and marks the Product as sold at the Shop.
func addShopBarcode(ctx context.Context, tx *sql.Tx, shopID, productID int64, code string, ruleID int64, itemCode string) (ShopBarcode, error) {
	if err := requireShop(ctx, tx, shopID); err != nil {
		return ShopBarcode{}, err
	}
	if err := requireProduct(ctx, tx, productID); err != nil {
		return ShopBarcode{}, err
	}
	var sb ShopBarcode
	var err error
	if ruleID == 0 {
		if code, err = product.NormalizeBarcode(code); err != nil {
			return ShopBarcode{}, err
		}
		var owner int64
		e := tx.QueryRowContext(ctx, `SELECT product_id FROM shop_barcodes WHERE shop_id = ? AND code = ?`, shopID, code).Scan(&owner)
		if e == nil {
			return ShopBarcode{}, takenBy(ctx, tx, code, owner)
		}
		if !errors.Is(e, sql.ErrNoRows) {
			return ShopBarcode{}, e
		}
		res, e := tx.ExecContext(ctx, `INSERT INTO shop_barcodes(shop_id, product_id, code) VALUES (?,?,?)`, shopID, productID, code)
		if e != nil {
			return ShopBarcode{}, e
		}
		sb = ShopBarcode{ShopID: shopID, ProductID: productID, Code: code}
		if sb.ID, err = res.LastInsertId(); err != nil {
			return ShopBarcode{}, err
		}
	} else {
		rule, e := loadRule(ctx, tx, ruleID)
		if e != nil {
			return ShopBarcode{}, e
		}
		if rule.ShopID != shopID {
			return ShopBarcode{}, ErrNotFound
		}
		if e := product.ValidateItemCode(rule.WeightRule, itemCode); e != nil {
			return ShopBarcode{}, e
		}
		var owner int64
		e = tx.QueryRowContext(ctx, `SELECT product_id FROM shop_barcodes WHERE rule_id = ? AND item_code = ?`, ruleID, itemCode).Scan(&owner)
		if e == nil {
			return ShopBarcode{}, takenBy(ctx, tx, itemCode, owner)
		}
		if !errors.Is(e, sql.ErrNoRows) {
			return ShopBarcode{}, e
		}
		res, e := tx.ExecContext(ctx, `INSERT INTO shop_barcodes(shop_id, product_id, rule_id, item_code) VALUES (?,?,?,?)`, shopID, productID, ruleID, itemCode)
		if e != nil {
			return ShopBarcode{}, e
		}
		sb = ShopBarcode{ShopID: shopID, ProductID: productID, RuleID: ruleID, ItemCode: itemCode}
		if sb.ID, err = res.LastInsertId(); err != nil {
			return ShopBarcode{}, err
		}
	}
	if err := setSoldAt(ctx, tx, productID, shopID); err != nil {
		return ShopBarcode{}, err
	}
	return sb, nil
}

func (s *Store) Product(ctx context.Context, id int64) (Detail, error) {
	var d Detail
	p, err := loadProduct(ctx, s.db, id)
	if err != nil {
		return d, err
	}
	d.Product = p
	d.Barcodes = []string{}
	d.Shops = []Shop{}
	d.ShopBarcodes = []ShopBarcode{}
	d.LatestPrices = []Price{}

	rows, err := s.db.QueryContext(ctx, `SELECT code FROM product_barcodes WHERE product_id = ? ORDER BY code`, id)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			rows.Close()
			return d, err
		}
		d.Barcodes = append(d.Barcodes, c)
	}
	rows.Close()

	rows, err = s.db.QueryContext(ctx, `SELECT sh.id, sh.name FROM product_shops ps JOIN shops sh ON sh.id = ps.shop_id
		WHERE ps.product_id = ? ORDER BY sh.name_key, sh.id`, id)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		var sh Shop
		if err := rows.Scan(&sh.ID, &sh.Name); err != nil {
			rows.Close()
			return d, err
		}
		d.Shops = append(d.Shops, sh)
	}
	rows.Close()

	rows, err = s.db.QueryContext(ctx, `SELECT id, shop_id, product_id, code, rule_id, item_code FROM shop_barcodes WHERE product_id = ? ORDER BY id`, id)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		sb, err := scanShopBarcode(rows)
		if err != nil {
			rows.Close()
			return d, err
		}
		d.ShopBarcodes = append(d.ShopBarcodes, sb)
	}
	rows.Close()

	all, err := pricesFor(ctx, s.db, id, nil)
	if err != nil {
		return d, err
	}
	for _, sh := range d.Shops {
		shopID := sh.ID
		var at []product.Price
		for _, pr := range all {
			if pr.ShopID == shopID {
				at = append(at, pr)
			}
		}
		if latest, ok := product.LatestPrice(at); ok {
			d.LatestPrices = append(d.LatestPrices, priceOut(latest, p))
		}
	}
	return d, nil
}

// Products are ordered by name (case-insensitive), then id.
func (s *Store) Products(ctx context.Context, f Filter) ([]Product, error) {
	var where []string
	var args []any
	if !f.IncludeArchived {
		where = append(where, "p.archived_at IS NULL")
	}
	if q := strings.ToLower(product.NormalizeName(f.Query)); q != "" {
		where = append(where, "instr(lower(p.name), ?) > 0")
		args = append(args, q)
	}
	if f.IngredientID != 0 {
		where = append(where, "p.ingredient_id = ?")
		args = append(args, f.IngredientID)
	}
	if f.Barcode != "" {
		code, err := product.NormalizeBarcode(f.Barcode)
		if err != nil {
			return []Product{}, nil
		}
		where = append(where, "p.id IN (SELECT product_id FROM product_barcodes WHERE code = ?)")
		args = append(args, code)
	}
	query := productSelect
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY lower(p.name), p.id"
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Product{}
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// UpdateProduct changes name and/or pack size (nil = keep). The Ingredient is fixed.
func (s *Store) UpdateProduct(ctx context.Context, id int64, name *string, packSize *float64) (Detail, error) {
	return s.PatchProduct(ctx, id, name, packSize, nil)
}

// PatchProduct changes name, pack size and/or Picture (nil = keep; "" image clears it) in one transaction, so a refused
// Picture (a *product.ValidationError on field "image") leaves the Product untouched. The replaced file is deleted when
// no Product uses it any more.
func (s *Store) PatchProduct(ctx context.Context, id int64, name *string, packSize *float64, image *string) (Detail, error) {
	var newImage string
	if image != nil {
		newImage = strings.TrimSpace(*image)
		if err := s.checkImage(newImage); err != nil {
			return Detail{}, err
		}
	}
	var old string
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		cur, err := loadProduct(ctx, tx, id)
		if err != nil {
			return err
		}
		in := product.Input{Name: cur.Name, IngredientID: cur.IngredientID, PackSize: cur.PackSize}
		if name != nil {
			in.Name = *name
		}
		if packSize != nil {
			in.PackSize = *packSize
		}
		if err := in.Validate(); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE products SET name=?, pack_size=?, updated_at=? WHERE id=?`,
			product.NormalizeName(in.Name), in.PackSize, s.now(), id); err != nil {
			return err
		}
		if image == nil {
			return nil
		}
		if err := tx.QueryRowContext(ctx, `SELECT image FROM products WHERE id = ?`, id).Scan(&old); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE products SET image=? WHERE id=?`, newImage, id)
		return err
	})
	if err != nil {
		return Detail{}, err
	}
	if image != nil && old != newImage {
		s.dropUnreferenced(ctx, old)
	}
	return s.Product(ctx, id)
}

// DeleteProduct: ErrBought while a purchase exists or a registered UsageCounter > 0
// (archive it instead); a never-bought Product can be deleted, archived or not.
func (s *Store) DeleteProduct(ctx context.Context, id int64) error {
	var old string
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		if err := requireProduct(ctx, tx, id); err != nil {
			return err
		}
		if err := tx.QueryRowContext(ctx, `SELECT image FROM products WHERE id = ?`, id).Scan(&old); err != nil {
			return err
		}
		var n int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM purchases WHERE product_id = ?`, id).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			return ErrBought
		}
		for _, count := range allUsages() {
			k, err := count(ctx, tx, id)
			if err != nil {
				return err
			}
			if k > 0 {
				return ErrBought
			}
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM products WHERE id = ?`, id)
		return err
	})
	if err == nil {
		s.dropUnreferenced(ctx, old)
	}
	return err
}

// AddBarcode adds a global barcode (raw, canonicalised). *BarcodeTakenError when
// another Product owns it; adding one the Product already has is a no-op.
func (s *Store) AddBarcode(ctx context.Context, productID int64, raw string) error {
	code, err := product.NormalizeBarcode(raw)
	if err != nil {
		return err
	}
	return s.withTx(ctx, func(tx *sql.Tx) error {
		if err := requireProduct(ctx, tx, productID); err != nil {
			return err
		}
		return addGlobalBarcode(ctx, tx, productID, code)
	})
}

// RemoveBarcode removes a global barcode of the Product (absent is fine).
func (s *Store) RemoveBarcode(ctx context.Context, productID int64, raw string) error {
	code, err := product.NormalizeBarcode(raw)
	if err != nil {
		return err
	}
	if err := requireProduct(ctx, s.db, productID); err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM product_barcodes WHERE product_id = ? AND code = ?`, productID, code)
	return err
}

// SetSoldAt / UnsetSoldAt manage "Shops known to sell it" (idempotent).
func (s *Store) SetSoldAt(ctx context.Context, productID, shopID int64) error {
	return s.withTx(ctx, func(tx *sql.Tx) error {
		if err := requireProduct(ctx, tx, productID); err != nil {
			return err
		}
		if err := requireShop(ctx, tx, shopID); err != nil {
			return err
		}
		return setSoldAt(ctx, tx, productID, shopID)
	})
}

func setSoldAt(ctx context.Context, tx *sql.Tx, productID, shopID int64) error {
	_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO product_shops(product_id, shop_id) VALUES (?, ?)`, productID, shopID)
	return err
}

func (s *Store) UnsetSoldAt(ctx context.Context, productID, shopID int64) error {
	if err := requireProduct(ctx, s.db, productID); err != nil {
		return err
	}
	if err := requireShop(ctx, s.db, shopID); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM product_shops WHERE product_id = ? AND shop_id = ?`, productID, shopID)
	return err
}

// ---- Shop Barcodes ----

func scanShopBarcode(sc interface{ Scan(...any) error }) (ShopBarcode, error) {
	var sb ShopBarcode
	var code, itemCode sql.NullString
	var ruleID sql.NullInt64
	err := sc.Scan(&sb.ID, &sb.ShopID, &sb.ProductID, &code, &ruleID, &itemCode)
	sb.Code = code.String
	sb.RuleID = ruleID.Int64
	sb.ItemCode = itemCode.String
	return sb, err
}

// AddShopBarcode adds a plain Shop-only code (raw, canonicalised) and marks the Product as sold at the Shop.
func (s *Store) AddShopBarcode(ctx context.Context, shopID, productID int64, raw string) (ShopBarcode, error) {
	var sb ShopBarcode
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		var err error
		sb, err = addShopBarcode(ctx, tx, shopID, productID, raw, 0, "")
		return err
	})
	return sb, err
}

// AddWeighedShopBarcode maps a rule's item code to a Product (product.ValidateItemCode).
func (s *Store) AddWeighedShopBarcode(ctx context.Context, shopID, productID, ruleID int64, itemCode string) (ShopBarcode, error) {
	var sb ShopBarcode
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		var err error
		sb, err = addShopBarcode(ctx, tx, shopID, productID, "", ruleID, itemCode)
		return err
	})
	return sb, err
}

func (s *Store) ShopBarcodes(ctx context.Context, shopID int64) ([]ShopBarcode, error) {
	if err := requireShop(ctx, s.db, shopID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, shop_id, product_id, code, rule_id, item_code FROM shop_barcodes WHERE shop_id = ? ORDER BY id`, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ShopBarcode{}
	for rows.Next() {
		sb, err := scanShopBarcode(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sb)
	}
	return out, rows.Err()
}

func (s *Store) DeleteShopBarcode(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM shop_barcodes WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ---- Prices ----

// pricesFor lists the Prices of a Product, newest first; shopID nil = all Shops.
func pricesFor(ctx context.Context, q Querier, productID int64, shopID *int64) ([]product.Price, error) {
	query := `SELECT id, product_id, shop_id, date, price_cents, price_per_kg_cents FROM prices WHERE product_id = ?`
	args := []any{productID}
	if shopID != nil {
		query += ` AND shop_id = ?`
		args = append(args, *shopID)
	}
	query += ` ORDER BY date DESC, id DESC`
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []product.Price{}
	for rows.Next() {
		var p product.Price
		var cents, perKg sql.NullInt64
		if err := rows.Scan(&p.ID, &p.ProductID, &p.ShopID, &p.Date, &cents, &perKg); err != nil {
			return nil, err
		}
		p.PriceCents = nullInt(cents)
		p.PricePerKgCents = nullInt(perKg)
		out = append(out, p)
	}
	return out, rows.Err()
}

func nullInt(n sql.NullInt64) *int {
	if !n.Valid {
		return nil
	}
	v := int(n.Int64)
	return &v
}

// priceOut serves a Price, with the price per kg explicit or derived from the Product.
func priceOut(p product.Price, pr Product) Price {
	out := Price{ID: p.ID, ProductID: p.ProductID, ShopID: p.ShopID, Date: p.Date, PriceCents: p.PriceCents}
	if cents, derived, ok := product.PricePerKg(p, pr.PackSize, pr.BaseUnit); ok {
		c := cents
		out.PricePerKgCents = &c
		out.PricePerKgDerived = derived
	}
	return out
}

// RecordPrice upserts on (product, shop, date) and marks the Product as sold at the Shop.
func (s *Store) RecordPrice(ctx context.Context, productID int64, in product.PriceInput) (Price, error) {
	if err := in.Validate(); err != nil {
		return Price{}, err
	}
	var id int64
	var pr Product
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		var err error
		if pr, err = loadProduct(ctx, tx, productID); err != nil {
			return err
		}
		if err := requireShop(ctx, tx, in.ShopID); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO prices(product_id, shop_id, date, price_cents, price_per_kg_cents) VALUES (?,?,?,?,?)
			ON CONFLICT(product_id, shop_id, date) DO UPDATE SET price_cents = excluded.price_cents, price_per_kg_cents = excluded.price_per_kg_cents`,
			productID, in.ShopID, in.Date, nullable(in.PriceCents), nullable(in.PricePerKgCents))
		if err != nil {
			return err
		}
		if err := tx.QueryRowContext(ctx, `SELECT id FROM prices WHERE product_id = ? AND shop_id = ? AND date = ?`,
			productID, in.ShopID, in.Date).Scan(&id); err != nil {
			return err
		}
		return setSoldAt(ctx, tx, productID, in.ShopID)
	})
	if err != nil {
		return Price{}, err
	}
	return priceOut(product.Price{ID: id, ProductID: productID, ShopID: in.ShopID, Date: in.Date,
		PriceCents: in.PriceCents, PricePerKgCents: in.PricePerKgCents}, pr), nil
}

func nullable(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}

// Prices, newest first (date desc, id desc); shopID nil = all Shops.
func (s *Store) Prices(ctx context.Context, productID int64, shopID *int64) ([]Price, error) {
	pr, err := loadProduct(ctx, s.db, productID)
	if err != nil {
		return nil, err
	}
	list, err := pricesFor(ctx, s.db, productID, shopID)
	if err != nil {
		return nil, err
	}
	out := []Price{}
	for _, p := range list {
		out = append(out, priceOut(p, pr))
	}
	return out, nil
}

// LatestPrice at the Shop; with a nil shopID, or none at that Shop, the latest at any Shop.
func (s *Store) LatestPrice(ctx context.Context, productID int64, shopID *int64) (Price, bool, error) {
	pr, err := loadProduct(ctx, s.db, productID)
	if err != nil {
		return Price{}, false, err
	}
	list, err := pricesFor(ctx, s.db, productID, shopID)
	if err != nil {
		return Price{}, false, err
	}
	if len(list) == 0 && shopID != nil {
		if list, err = pricesFor(ctx, s.db, productID, nil); err != nil {
			return Price{}, false, err
		}
	}
	latest, ok := product.LatestPrice(list)
	if !ok {
		return Price{}, false, nil
	}
	return priceOut(latest, pr), true, nil
}

func (s *Store) DeletePrice(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM prices WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ---- Purchases and "last bought" ----

// RecordPurchase logs that a Product was bought (shopID nil = at home) and marks it sold at the Shop.
func (s *Store) RecordPurchase(ctx context.Context, productID int64, shopID *int64, date string) (int64, error) {
	if !product.ValidDate(date) {
		return 0, &product.ValidationError{Field: "date", Message: "date must be a real day as YYYY-MM-DD"}
	}
	var id int64
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		if err := requireProduct(ctx, tx, productID); err != nil {
			return err
		}
		var shop any
		if shopID != nil {
			if err := requireShop(ctx, tx, *shopID); err != nil {
				return err
			}
			shop = *shopID
			if err := setSoldAt(ctx, tx, productID, *shopID); err != nil {
				return err
			}
		}
		res, err := tx.ExecContext(ctx, `INSERT INTO purchases(product_id, shop_id, bought_on, created_at) VALUES (?,?,?,?)`,
			productID, shop, date, s.now())
		if err != nil {
			return err
		}
		id, err = res.LastInsertId()
		return err
	})
	return id, err
}

func (s *Store) DeletePurchase(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM purchases WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// LastBought: see the design note.
func (s *Store) LastBought(ctx context.Context, ingredientID int64, shopID *int64) (Product, bool, error) {
	if shopID != nil {
		p, ok, err := lastBoughtOne(ctx, s.db, ingredientID, shopID)
		if err != nil || ok {
			return p, ok, err
		}
	}
	return lastBoughtOne(ctx, s.db, ingredientID, nil)
}

func lastBoughtOne(ctx context.Context, q Querier, ingredientID int64, shopID *int64) (Product, bool, error) {
	query := productSelect + ` JOIN purchases pu ON pu.product_id = p.id WHERE p.ingredient_id = ? AND p.archived_at IS NULL`
	args := []any{ingredientID}
	if shopID != nil {
		query += ` AND pu.shop_id = ?`
		args = append(args, *shopID)
	}
	query += ` ORDER BY pu.bought_on DESC, pu.id DESC LIMIT 1`
	p, err := scanProduct(q.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return Product{}, false, nil
	}
	if err != nil {
		return Product{}, false, err
	}
	return p, true, nil
}

// LastBoughtMany answers for many Ingredients at once; Ingredients with no purchase are absent.
func (s *Store) LastBoughtMany(ctx context.Context, ingredientIDs []int64, shopID *int64) (map[int64]Product, error) {
	out := map[int64]Product{}
	for _, id := range ingredientIDs {
		p, ok, err := s.LastBought(ctx, id, shopID)
		if err != nil {
			return nil, err
		}
		if ok {
			out[id] = p
		}
	}
	return out, nil
}

// ---- Catalog and resolution ----

// Catalog for a Shop, or for home when shopID is nil (ErrNotFound for an unknown Shop).
func (s *Store) Catalog(ctx context.Context, shopID *int64) (barcode.Catalog, error) {
	global, err := s.globalBarcodes(ctx)
	if err != nil {
		return barcode.Catalog{}, err
	}
	if shopID == nil {
		return product.BuildCatalog(product.CatalogRows{Global: global}), nil
	}
	if err := requireShop(ctx, s.db, *shopID); err != nil {
		return barcode.Catalog{}, err
	}
	rules, err := s.Rules(ctx, *shopID)
	if err != nil {
		return barcode.Catalog{}, err
	}
	sbs, err := s.activeShopBarcodes(ctx, *shopID)
	if err != nil {
		return barcode.Catalog{}, err
	}
	rows := product.CatalogRows{
		Global: global,
		Prices: map[int64][]product.Price{},
	}
	for _, r := range rules {
		rows.Rules = append(rows.Rules, r.WeightRule)
	}
	for _, sb := range sbs {
		rows.ShopBarcodes = append(rows.ShopBarcodes, product.ShopBarcode{
			ID: sb.ID, ShopID: sb.ShopID, ProductID: sb.ProductID, Code: sb.Code, RuleID: sb.RuleID, ItemCode: sb.ItemCode,
		})
		if sb.RuleID == 0 {
			continue
		}
		if _, done := rows.Prices[sb.ProductID]; done {
			continue
		}
		list, err := pricesFor(ctx, s.db, sb.ProductID, shopID)
		if err != nil {
			return barcode.Catalog{}, err
		}
		rows.Prices[sb.ProductID] = list
	}
	return product.BuildCatalog(rows), nil
}

func (s *Store) globalBarcodes(ctx context.Context) (map[string]int64, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT pb.code, pb.product_id FROM product_barcodes pb
		JOIN products p ON p.id = pb.product_id WHERE p.archived_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var code string
		var id int64
		if err := rows.Scan(&code, &id); err != nil {
			return nil, err
		}
		out[code] = id
	}
	return out, rows.Err()
}

// Resolve parses raw (barcode.Parse with format), builds the Catalog and resolves.
func (s *Store) Resolve(ctx context.Context, raw string, format barcode.Format, shopID *int64) (Resolved, error) {
	cat, err := s.Catalog(ctx, shopID)
	if err != nil {
		return Resolved{}, err
	}
	res := barcode.Resolve(barcode.Parse(raw, format), cat)
	out := Resolved{Resolution: res}
	if res.ProductID != 0 {
		p, err := loadProduct(ctx, s.db, res.ProductID)
		if err != nil {
			return Resolved{}, err
		}
		out.Product = &p
		return out, nil
	}
	if out.ArchivedProduct, err = s.archivedOwner(ctx, res, shopID); err != nil {
		return Resolved{}, err
	}
	return out, nil
}

// archivedOwner names the archived Product that owns an unknown code (or the
// weighed Shop Barcode of an unknown rule), so the scan UI can offer to unarchive it.
func (s *Store) archivedOwner(ctx context.Context, res barcode.Resolution, shopID *int64) (*Product, error) {
	var ids []int64
	collect := func(query string, args ...any) error {
		rows, err := s.db.QueryContext(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				return err
			}
			ids = append(ids, id)
		}
		return rows.Err()
	}
	switch res.Outcome {
	case barcode.OutcomeUnknownWeighedProduct:
		if shopID != nil {
			if err := collect(`SELECT sb.product_id FROM shop_barcodes sb JOIN products p ON p.id = sb.product_id
				WHERE sb.shop_id = ? AND sb.rule_id = ? AND sb.item_code = ? AND p.archived_at IS NOT NULL`,
				*shopID, res.RuleID, res.ItemCode); err != nil {
				return nil, err
			}
		}
	case barcode.OutcomeUnknown:
		if err := collect(`SELECT pb.product_id FROM product_barcodes pb JOIN products p ON p.id = pb.product_id
			WHERE pb.code = ? AND p.archived_at IS NOT NULL`, res.Code); err != nil {
			return nil, err
		}
		if shopID != nil {
			if err := collect(`SELECT sb.product_id FROM shop_barcodes sb JOIN products p ON p.id = sb.product_id
				WHERE sb.shop_id = ? AND sb.code = ? AND p.archived_at IS NOT NULL`, *shopID, res.Code); err != nil {
				return nil, err
			}
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}
	p, err := loadProduct(ctx, s.db, ids[0])
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// SetArchived archives (true) or restores (false) a Product. Idempotent. An archived
// Product is left out of lists (unless Filter.IncludeArchived), left out of the
// Catalog, Resolve and LastBought, but keeps its barcodes, purchases and Prices.
// ErrNotFound for an unknown id.
func (s *Store) SetArchived(ctx context.Context, id int64, archived bool) (Detail, error) {
	err := s.withTx(ctx, func(tx *sql.Tx) error {
		if err := requireProduct(ctx, tx, id); err != nil {
			return err
		}
		var err error
		if archived {
			// keep the first archive time when already archived
			_, err = tx.ExecContext(ctx, `UPDATE products SET archived_at = COALESCE(archived_at, ?) WHERE id = ?`, s.now(), id)
		} else {
			_, err = tx.ExecContext(ctx, `UPDATE products SET archived_at = NULL WHERE id = ?`, id)
		}
		return err
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Product(ctx, id)
}

// activeShopBarcodes lists the Shop Barcodes of a Shop whose Product is not archived (the Catalog).
func (s *Store) activeShopBarcodes(ctx context.Context, shopID int64) ([]ShopBarcode, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT sb.id, sb.shop_id, sb.product_id, sb.code, sb.rule_id, sb.item_code
		FROM shop_barcodes sb JOIN products p ON p.id = sb.product_id
		WHERE sb.shop_id = ? AND p.archived_at IS NULL ORDER BY sb.id`, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ShopBarcode{}
	for rows.Next() {
		sb, err := scanShopBarcode(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sb)
	}
	return out, rows.Err()
}
