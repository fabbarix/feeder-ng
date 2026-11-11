package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/images"
	"github.com/fabbarix/feeder-ng/internal/images/refs"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	ingredient "github.com/fabbarix/feeder-ng/internal/ingredient"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/product"
	productstore "github.com/fabbarix/feeder-ng/internal/product/store"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
	scanstore "github.com/fabbarix/feeder-ng/internal/scan/store"
	shoppinghttpapi "github.com/fabbarix/feeder-ng/internal/shopping/httpapi"
	"github.com/fabbarix/feeder-ng/internal/stock"
	stockservice "github.com/fabbarix/feeder-ng/internal/stock/service"
	stockstore "github.com/fabbarix/feeder-ng/internal/stock/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// This file holds the scan service's real adapters: Stock (T10), Products and Shops (T9), Ingredients (T2).
// The household and the Shopping List come from the shopping module's constructors.

// stockPort adds, removes and sets Stock Lots (T10).
type stockPort struct{ svc *stockservice.Service }

func (p stockPort) AddLot(ctx context.Context, in service.StockAdd) (int64, bool, error) {
	v, created, err := p.svc.AddLot(ctx, stockservice.AddInput{IngredientID: in.IngredientID, Quantity: in.Quantity,
		Purchased: in.Purchased, Source: stockstore.SourceScan, ProductID: in.ProductID, ShopID: in.ShopID, ClientUUID: in.ClientUUID})
	if err != nil {
		return 0, false, stockDomainError(err)
	}
	return v.ID, created, nil
}

// RemoveLot deletes a Lot Undo added; a Lot already gone (the user threw it out) is not an error.
func (p stockPort) RemoveLot(ctx context.Context, id int64) error {
	err := p.svc.RemoveLot(ctx, id)
	if errors.Is(err, stockstore.ErrNotFound) {
		return nil
	}
	return stockDomainError(err)
}

// stockDomainError maps Stock's unknown-Ingredient error to the scan service's sentinel (a rejected Result).
func stockDomainError(err error) error {
	if errors.Is(err, stockservice.ErrUnknownIngredient) {
		return service.ErrUnknownIngredient
	}
	return err
}

func (p stockPort) Total(ctx context.Context, ingredientID int64) (float64, error) {
	all, err := p.svc.Totals(ctx)
	if err != nil {
		return 0, stockDomainError(err)
	}
	for _, t := range all {
		if t.IngredientID == ingredientID {
			return t.Total, nil
		}
	}
	return 0, nil
}

func (p stockPort) SetTotal(ctx context.Context, ingredientID int64, total float64) error {
	_, err := p.svc.SetTotal(ctx, ingredientID, total)
	return stockDomainError(err)
}

// catalogue is the Products and Shops port (T9).
type catalogue struct {
	db *sql.DB
	st *productstore.Store
}

func productInfo(p productstore.Product) service.ProductInfo {
	return service.ProductInfo{ID: p.ID, Name: p.Name, IngredientID: p.IngredientID, IngredientName: p.IngredientName,
		BaseUnit: string(p.BaseUnit), PackSize: p.PackSize, ImageURL: p.ImageURL}
}

func (c catalogue) ShopExists(ctx context.Context, id int64) (bool, error) {
	_, err := c.st.Shop(ctx, id)
	if errors.Is(err, productstore.ErrNotFound) {
		return false, nil
	}
	return err == nil, err
}

func (c catalogue) Product(ctx context.Context, id int64) (service.ProductInfo, error) {
	d, err := c.st.Product(ctx, id)
	if errors.Is(err, productstore.ErrNotFound) {
		return service.ProductInfo{}, service.ErrProductGone
	}
	if err != nil {
		return service.ProductInfo{}, err
	}
	return productInfo(d.Product), nil
}

func (c catalogue) CreateProduct(ctx context.Context, in service.NewProduct) (service.ProductInfo, error) {
	np := productstore.NewProduct{Input: product.Input{Name: in.Name, IngredientID: in.IngredientID, PackSize: in.PackSize, Image: in.Image}, Barcodes: in.Barcodes}
	for _, sb := range in.ShopBarcodes {
		np.ShopBarcodes = append(np.ShopBarcodes, productstore.NewShopBarcode{ShopID: sb.ShopID, Code: sb.Code, RuleID: sb.RuleID, ItemCode: sb.ItemCode})
	}
	d, err := c.st.CreateProduct(ctx, np)
	var taken *productstore.BarcodeTakenError
	if errors.As(err, &taken) {
		return service.ProductInfo{}, &service.BarcodeTakenError{ProductID: taken.ProductID, Archived: taken.Archived}
	}
	if errors.Is(err, productstore.ErrUnknownIngredient) {
		return service.ProductInfo{}, service.ErrUnknownIngredient
	}
	var invalid *product.ValidationError
	if errors.As(err, &invalid) {
		return service.ProductInfo{}, &scan.ValidationError{Field: invalid.Field, Message: invalid.Message}
	}
	if err != nil {
		return service.ProductInfo{}, err
	}
	return productInfo(d.Product), nil
}

// SoldAt reports whether the Product is already sold at the Shop (T9's product_shops link).
func (c catalogue) SoldAt(ctx context.Context, productID, shopID int64) (bool, error) {
	var n int
	err := c.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM product_shops WHERE product_id = ? AND shop_id = ?`, productID, shopID).Scan(&n)
	return n > 0, err
}

func (c catalogue) SetSoldAt(ctx context.Context, productID, shopID int64) error {
	return c.st.SetSoldAt(ctx, productID, shopID)
}

func (c catalogue) UnsetSoldAt(ctx context.Context, productID, shopID int64) error {
	return c.st.UnsetSoldAt(ctx, productID, shopID)
}

func (c catalogue) RecordPurchase(ctx context.Context, productID int64, shopID *int64, date stock.Date) (int64, error) {
	return c.st.RecordPurchase(ctx, productID, shopID, string(date))
}

func (c catalogue) DeletePurchase(ctx context.Context, id int64) error {
	return c.st.DeletePurchase(ctx, id)
}

// LatestPrice is the newest Price at this Shop only.
func (c catalogue) LatestPrice(ctx context.Context, productID, shopID int64) (*service.PriceInfo, error) {
	list, err := c.st.Prices(ctx, productID, &shopID)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return priceInfo(list[0]), nil
}

func (c catalogue) PriceOn(ctx context.Context, productID, shopID int64, date stock.Date) (*service.PriceInfo, error) {
	list, err := c.st.Prices(ctx, productID, &shopID)
	if err != nil {
		return nil, err
	}
	for _, p := range list {
		if p.Date == string(date) {
			return priceInfo(p), nil
		}
	}
	return nil, nil
}

func (c catalogue) RecordPrice(ctx context.Context, productID int64, in service.PriceInput) (service.PriceInfo, error) {
	p, err := c.st.RecordPrice(ctx, productID, product.PriceInput{ShopID: in.ShopID, Date: string(in.Date),
		PriceCents: in.PriceCents, PricePerKgCents: in.PricePerKgCents})
	if err != nil {
		var invalid *product.ValidationError
		if errors.As(err, &invalid) {
			return service.PriceInfo{}, &scan.ValidationError{Field: invalid.Field, Message: invalid.Message}
		}
		return service.PriceInfo{}, err
	}
	return *priceInfo(p), nil
}

func (c catalogue) DeletePrice(ctx context.Context, id int64) error {
	return c.st.DeletePrice(ctx, id)
}

func priceInfo(p productstore.Price) *service.PriceInfo {
	return &service.PriceInfo{ID: p.ID, Date: stock.Date(p.Date), PriceCents: p.PriceCents, PricePerKgCents: p.PricePerKgCents}
}

// OfflineData is the offline data: the barcode Catalog of the Shop (or home), the Products and the latest Price per Product there.
func (c catalogue) OfflineData(ctx context.Context, shopID *int64) (service.OfflineData, error) {
	catalog, err := c.st.Catalog(ctx, shopID)
	if errors.Is(err, productstore.ErrNotFound) {
		return service.OfflineData{}, service.ErrNotFound
	}
	if err != nil {
		return service.OfflineData{}, err
	}
	out := service.OfflineData{ShopID: shopID, Catalog: catalog, Products: []service.OfflineProduct{}}
	if shopID != nil {
		shop, err := c.st.Shop(ctx, *shopID)
		if err != nil {
			return service.OfflineData{}, err
		}
		out.ShopName = shop.Name
	}
	products, err := c.st.Products(ctx, productstore.Filter{})
	if err != nil {
		return service.OfflineData{}, err
	}
	for _, p := range products {
		bp := service.OfflineProduct{ID: p.ID, Name: p.Name, IngredientID: p.IngredientID, IngredientName: p.IngredientName,
			BaseUnit: string(p.BaseUnit), PackSize: p.PackSize, ImageURL: p.ImageURL}
		if shopID != nil {
			if latest, err := c.LatestPrice(ctx, p.ID, *shopID); err != nil {
				return service.OfflineData{}, err
			} else if latest != nil {
				bp.LastPriceCents = latest.PriceCents
			}
		}
		out.Products = append(out.Products, bp)
	}
	return out, nil
}

// ingredientsPort finds an Ingredient by name or creates it (T2).
type ingredientsPort struct{ st *ingredientstore.Store }

func (i ingredientsPort) Ensure(ctx context.Context, name, baseUnit string) (int64, error) {
	ing, err := i.st.ByName(ctx, name)
	if err == nil {
		return ing.ID, nil
	}
	if !errors.Is(err, ingredientstore.ErrNotFound) {
		return 0, err
	}
	created, err := i.st.Create(ctx, ingredient.Input{Name: name, Base: units.Base(baseUnit)})
	if err != nil {
		return 0, err
	}
	return created.ID, nil
}

// Compile-time checks.
var (
	_ service.Stock       = stockPort{}
	_ service.Catalogue   = catalogue{}
	_ service.Ingredients = ingredientsPort{}
	_ service.Dates       = (*shoppinghttpapi.Household)(nil)
)

func newService(d app.Deps) *service.Service {
	hh := shoppinghttpapi.NewHousehold(d)
	return service.New(service.Deps{
		Ledger:      scanstore.New(d.DB, d.Clock),
		Stock:       stockPort{svc: shoppinghttpapi.NewStock(d)},
		Catalogue:   catalogue{db: d.DB, st: productstore.New(d.DB, d.Clock, productstore.WithImages(images.NewGuarded(imaging.NewStore(filepath.Join(d.Config.DataDir, "images")), refs.New(d.DB))))},
		Ingredients: ingredientsPort{st: ingredientstore.New(d.DB, d.Clock)},
		List:        shoppinghttpapi.NewService(d),
		Household:   hh,
		Dates:       hh,
		Clock:       d.Clock,
		Publisher:   d.Events,
	})
}
