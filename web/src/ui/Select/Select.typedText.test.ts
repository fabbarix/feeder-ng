import { describe, expect, it } from 'vitest'
import source from './Select.tsx?raw'

// BR-D round 4: the leftover pair `[rankText, setTypedText]` is one name: `typedText` / `setTypedText`.
describe('Select.tsx naming', () => {
  it('has no rankText: the state is typedText with its setter setTypedText', () => {
    expect(source).not.toMatch(/\brankText\b/)
    expect(source).toMatch(/\[typedText, setTypedText\] = useState/)
  })
  it('still ranks by the search, or by the typed text in a list without a search', () => {
    expect(source).toMatch(/rank: showSearch \? q : typedText/)
  })
})
