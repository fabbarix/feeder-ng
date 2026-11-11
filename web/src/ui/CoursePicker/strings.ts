// The words CoursePicker speaks (GLOSSARY: "Course", "main Course", "Meal Slot"). Kept apart from the component.

export const coursePickerStrings = {
  /** Read after the name of the main Course chip, and shown as a marker on its row. */
  mainCourse: 'main Course',
  /** The accessible name of the ordered list of chosen Courses. */
  chosenList: (label: string) => `${label} in order`,
  moveUp: (name: string) => `Move ${name} up`,
  moveDown: (name: string) => `Move ${name} down`,
  remove: (name: string) => `Remove ${name}`,
}
