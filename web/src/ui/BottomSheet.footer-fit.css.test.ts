// Batch w3e (B9-34: Add extra at 375 crushed Cancel into a circle): a sheet footer with Cancel never shrinks a control below its
// label. One row when everything fits; otherwise the controls stack full width with the decision on top (wrap-reverse).
import { describe, expect, it } from 'vitest'
import { rule, stylesheet } from '../test/cssRules'

const { base } = stylesheet('src/ui/BottomSheet.css')

describe('the sheet footer with Cancel', () => {
  it('wraps instead of squeezing, with the decision stacked on top (wrap-reverse)', () => {
    expect(rule(base, '.sheet__footer[data-cancel]')['flex-wrap']).toBe('wrap-reverse')
  })
  it('each control starts from its natural width and never goes below its label', () => {
    expect(rule(base, '.sheet__footer[data-cancel] > *')).toMatchObject({ flex: '2 1 auto', 'min-inline-size': 'min(100%, max-content)' })
    expect(rule(base, '.sheet__footer[data-cancel] > .sheet__cancel')['flex']).toBe('1 1 auto')
  })
  it('a FormActions row beside Cancel is one control like the others, declared after the rule that gives it the whole row', () => {
    expect(rule(base, '.sheet__footer[data-cancel] > .form-actions')).toMatchObject({ flex: '2 1 auto', 'min-inline-size': 'min(100%, max-content)', 'inline-size': 'auto' })
    expect(base.lastIndexOf('.sheet__footer[data-cancel] > .form-actions')).toBeGreaterThan(base.lastIndexOf('.sheet__footer > .form-actions'))
  })
})
