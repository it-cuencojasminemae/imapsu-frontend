// Types of business a stall can run. The OAS allows one stall of each type on
// campus, so the server refuses an application for a type an occupied stall
// already runs ("Other" is reviewed by the OAS instead).
// The backend keeps the same list in src/utils/business-types.ts.

export const OTHER_BUSINESS_TYPE = 'Other'

export const BUSINESS_TYPE_GROUPS: { category: string; types: string[] }[] = [
  {
    category: 'Food and beverage',
    types: [
      'Coffee shop',
      'Milk tea and refreshments',
      'Rice meals and viands',
      'Grilled and fried food',
      'Bakery and pastries',
      'Snacks and kakanin',
      'Desserts and ice cream'
    ]
  },
  {
    category: 'Printing and services',
    types: [
      'Printing and photocopying',
      'Computer and gadget repair',
      'Internet café and computer rental',
      'Laundry',
      'Barbershop and salon'
    ]
  },
  {
    category: 'Retail',
    types: [
      'School and office supplies',
      'Books and reviewers',
      'Uniforms and souvenirs',
      'Gadget accessories and e-load',
      'Grocery and convenience store',
      'Pharmacy and health products'
    ]
  },
  { category: 'Other', types: [OTHER_BUSINESS_TYPE] }
]

export const BUSINESS_TYPES = BUSINESS_TYPE_GROUPS.flatMap(group => group.types)

type BusinessTypeItem = { type: 'label'; label: string } | { label: string; value: string; disabled?: boolean }

// Grouped items for USelect. Types in `taken` are shown as already on campus
// and, unless `allowTaken`, cannot be picked.
export const businessTypeItems = (taken: Iterable<string> = [], allowTaken = false): BusinessTypeItem[][] => {
  const takenSet = new Set(taken)
  return BUSINESS_TYPE_GROUPS.map(group => [
    // "Other" is a group of one, so it needs no heading of its own.
    ...(group.category === OTHER_BUSINESS_TYPE ? [] : [{ type: 'label' as const, label: group.category }]),
    ...group.types.map(type => takenSet.has(type) && type !== OTHER_BUSINESS_TYPE
      ? { label: `${type} (already on campus)`, value: type, disabled: !allowTaken }
      : { label: type, value: type })
  ])
}
