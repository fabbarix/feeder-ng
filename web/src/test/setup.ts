import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { installDialogPolyfill } from './dialogPolyfill'

installDialogPolyfill()
afterEach(() => cleanup())
