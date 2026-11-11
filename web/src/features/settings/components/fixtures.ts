import type { AllowedUser, HouseholdSettings, MealSlot, Member } from '../types'

export const anna: Member = { id: 1, name: 'Anna', colour: '#3366cc', avatar: '', portionFactor: 1, userId: 2, email: null }
export const marco: Member = { id: 2, name: 'Marco', colour: '#e07a5f', avatar: '', portionFactor: 1, userId: null, email: null }
export const sam: Member = { id: 3, name: 'Sam', colour: '#81b29a', avatar: '🦊', portionFactor: 0.5, userId: null, email: null }
export const members = [anna, marco, sam]

export const tuesdayDinner: MealSlot = {
  id: 10, weekday: 2, name: 'Dinner', time: '19:30', portionsNeeded: 2.5,
  attendance: [{ memberId: 1, portionFactorOverride: null }, { memberId: 2, portionFactorOverride: null }, { memberId: 3, portionFactorOverride: null }],
}
export const thursdayDinner: MealSlot = { ...tuesdayDinner, id: 11, weekday: 4, time: '19:00' }
export const mondayLunch: MealSlot = { id: 12, weekday: 1, name: 'Lunch', time: '12:30', portionsNeeded: 0, attendance: [] }

export const householdSettings: HouseholdSettings = {
  timeZone: 'Europe/Rome', timeZoneConfigured: true, planningHorizonDays: 7, defaultCooldownDays: 7, defaultLeftoverUseByDays: 3,
  quietHours: { start: '22:00', end: '07:00' }, plannerStyle: 0.5, location: { city: 'Turin' }, currency: 'USD',
}

export const admin: AllowedUser = { id: 1, email: 'admin@example.test', displayName: 'Admin', isAdmin: true }
export const cook: AllowedUser = { id: 2, email: 'cook@example.test', displayName: 'Cook', isAdmin: false }
