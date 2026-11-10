// Titles come from the Import feature so the crumb and the h1 cannot drift.
import { importStrings } from '../features/import/strings'
// English crumb labels for the hierarchical routes (the Settings pages take their titles from settingsStrings).
export const breadcrumbStrings = {
  roots: {
    settings: 'Settings',
    recipes: 'Recipes',
    ingredients: 'Ingredients',
    products: 'Products',
  },
  /** Fallback labels for an entity crumb until its name is known (the GLOSSARY term). */
  entity: {
    shop: 'Shop',
    recipe: 'Recipe',
    ingredient: 'Ingredient',
    product: 'Product',
  },
  newRecipe: 'New Recipe',
  importRecipes: importStrings.importTitle,
  exportRecipes: importStrings.exportTitle,
  edit: 'Edit',
}
