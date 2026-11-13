// Titles come from the Import feature so the crumb and the h1 cannot drift.
import { importStrings } from '../features/import/strings'
// English crumb labels for the hierarchical routes (the Settings pages take their titles from settingsStrings).
export const breadcrumbStrings = {
  roots: {
    settings: 'Settings',
    recipes: 'Recipes',
    plan: 'Plan',
  },
  /** beta.5: the Catalogue lists sit under Settings, so their crumb is the list's own title. */
  catalogue: {
    ingredients: 'Ingredients',
    /** H5: the Supplies list, Settings > Supplies. */
    supplies: 'Supplies',
    products: 'Products',
  },
  /** Fallback labels for an entity crumb until its name is known (the GLOSSARY term). */
  entity: {
    shop: 'Shop',
    recipe: 'Recipe',
    ingredient: 'Ingredient',
    product: 'Product',
  },
  /** H5: a Supply's page crumb until its name is known (the GLOSSARY term); its own key, the entity list above is pinned. */
  supplyEntity: 'Supply',
  newRecipe: 'New Recipe',
  importRecipes: importStrings.importTitle,
  exportRecipes: importStrings.exportTitle,
  edit: 'Edit',
  /** CRS G2: the Review Exclusions page's title and its crumb. */
  reviewExclusions: 'Review Exclusions',
}
