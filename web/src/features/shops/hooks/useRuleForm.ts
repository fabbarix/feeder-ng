import { useMemo, useState } from 'react'
import { errorText } from '../../products/lib/productForm'
import { decodeSample, type RulePreview } from '../lib/rulePreview'
import { emptyRuleForm, ruleFormError, ruleToForm, setKind, toRule, type RuleFormValues } from '../lib/ruleForm'
import type { RuleBody } from '../api'
import type { ShopRule } from '../types'

/** State of the Weight Barcode Rule editor: the form, the sample barcode and its live decode. */
export function useRuleForm(initial: ShopRule | undefined, onSave: (rule: RuleBody) => Promise<void>) {
  const [values, setValues] = useState<RuleFormValues>(() => (initial ? ruleToForm(initial) : emptyRuleForm()))
  const [sample, setSample] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)

  const rule = useMemo(() => toRule(values), [values])
  const error = useMemo(() => ruleFormError(values), [values])
  const preview = useMemo<RulePreview>(() => {
    if (rule) return decodeSample(rule, sample)
    return sample.trim() === '' ? { state: 'idle' } : { state: 'nomatch' }
  }, [rule, sample])

  const setField = (field: keyof RuleFormValues, value: string) => {
    setValues((v) => (field === 'kind' ? setKind(v, value as RuleFormValues['kind']) : { ...v, [field]: value }))
  }

  const submit = async () => {
    setAttempted(true)
    if (!rule || error !== null) return
    const { id: _id, ...body } = rule
    void _id
    setSaving(true)
    setServerError(null)
    try {
      await onSave(body)
    } catch (e) {
      setServerError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

    /** The validation reason, shown only once Save was pressed. */
  const shownError = attempted ? error : null
  return { values, sample, setSample, setField, error, shownError, preview, serverError, saving, submit }
}

