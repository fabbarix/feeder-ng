# Product catalogue is built by the Household, not an external database

Products (barcode → Ingredient, pack size), Shop Barcodes and Weight Barcode Rules are created by Users while scanning. No external product database such as Open Food Facts is queried. External databases have patchy coverage of local and own-label goods, can't map a barcode to *our* Ingredient or Base Unit, and would add a network dependency in the shop. The cost is a one-time "what is this?" form the first time each barcode is scanned.
