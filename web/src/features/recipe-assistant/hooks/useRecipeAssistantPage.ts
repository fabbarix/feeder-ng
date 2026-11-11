import { useEffect, useState } from 'react'
import { useMe } from '../../../app/useMe'
import { useConfirm, useToast } from '../../../ui'
import { fieldMessage, mapSaveError, mapTestError, warningCopy, type SaveErrors } from '../lib/errors'
import { createModelLabel, isValidModelId, toModelOptions } from '../lib/modelOptions'
import {
  canCallWithUnsavedValues,
  formFromSettings,
  isDirty,
  keyRowState,
  modelsRequest,
  originChanged,
  statusOf,
  testRequest,
  toPutBody,
  unavailableHint,
  validateForm,
  withReplacing,
  type SettingsForm,
} from '../lib/settingsForm'
import { raStrings } from '../strings'
import { useModelChoices } from './useModelChoices'
import { useRecipeAssistantSettings } from './useRecipeAssistantSettings'
import { useTestConnection } from './useTestConnection'

const NO_ERRORS: SaveErrors = { fields: {} }

/**
 * Everything the Recipe Assistant settings screen needs: the Admin gate, the saved settings, the editable form (a draft
 * over the saved values), what is shown after Save, the model list and Test connection. The screen only renders it.
 */
export function useRecipeAssistantPage() {
  const me = useMe()
  const confirm = useConfirm()
  const toast = useToast()
  const isAdmin = me.data?.isAdmin === true
  const stored = useRecipeAssistantSettings(isAdmin)
  const settings = stored.settings
  const test = useTestConnection()

  const [draft, setDraft] = useState<SettingsForm | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<SaveErrors>(NO_ERRORS)
  const [modelIdError, setModelIdError] = useState<string | undefined>()
  const [notice, setNotice] = useState<string | undefined>()
  const [focusKey, setFocusKey] = useState(0)
  const [now] = useState(() => new Date())

  const form = draft ?? (settings ? formFromSettings(settings) : undefined)
  const typedKey = (form?.apiKey ?? '').trim()
  const changedOrigin = Boolean(settings && form && originChanged(form, settings))
  const canCall = Boolean(settings && form && canCallWithUnsavedValues(form, settings))

  const choices = useModelChoices({
    enabled: isAdmin && canCall && typedKey === '' && !changedOrigin,
    baseUrl: changedOrigin && form ? form.baseUrl.trim() : undefined,
    apiKey: typedKey === '' ? undefined : typedKey,
  })

  // The page opens once the model list has answered (or was not asked for), so the Model trigger shows the model's name.
  const [bootstrapped, setBootstrapped] = useState(false)
  const modelsSettled = !choices.isPending
  useEffect(() => {
    if (settings && modelsSettled) setBootstrapped(true)
  }, [settings, modelsSettled])

  /** Every edit forgets the last server answer and the last test: they no longer describe the form. */
  const edit = (update: (f: SettingsForm) => SettingsForm) => {
    if (!form) return
    setDraft(update(form))
    setServerErrors(NO_ERRORS)
    setModelIdError(undefined)
    setNotice(undefined)
    test.reset()
  }

  const validation = settings && form ? validateForm(form, settings) : {}
  const retired = Boolean(settings && form && settings.modelStatus === 'unavailable' && form.model.trim() === settings.model)
  const fields = serverErrors.fields
  const errors = {
    enabled: fields.enabled,
    baseUrl: fields.baseUrl ?? (validation.baseUrl ? fieldMessage(validation.baseUrl) : undefined),
    model:
      fields.model ??
      modelIdError ??
      (submitted && validation.model ? fieldMessage(validation.model) : undefined) ??
      (retired ? raStrings.modelRetired : undefined),
    apiKey: fields.apiKey ?? (submitted && validation.apiKey ? fieldMessage(validation.apiKey) : undefined),
    form: serverErrors.form,
  }

  const save = async () => {
    if (!form || !settings) return
    setSubmitted(true)
    if (Object.keys(validateForm(form, settings)).length > 0) return
    try {
      const { warnings } = await stored.save(toPutBody(form, settings))
      setDraft(null)
      setSubmitted(false)
      setServerErrors(NO_ERRORS)
      const warning = warnings[0]
      if (warning) setNotice(warningCopy(warning.code))
      else toast.show(raStrings.saved, { status: 'success' })
    } catch (err) {
      setServerErrors(mapSaveError(err))
    }
  }

  const cancel = () => {
    setDraft(null)
    setSubmitted(false)
    setServerErrors(NO_ERRORS)
    setModelIdError(undefined)
    setNotice(undefined)
    test.reset()
  }

  const removeKey = async () => {
    const choice = await confirm.choose({ title: raStrings.removeTitle, body: raStrings.removeBody, tone: 'danger', confirmLabel: raStrings.remove })
    if (choice !== 'confirm') return
    try {
      await stored.removeKey()
      cancel()
      setFocusKey((k) => k + 1)
    } catch {
      setServerErrors({ fields: {}, form: raStrings.removeFailed })
    }
  }

  const replaceKey = () => {
    edit((f) => withReplacing(f, true))
    setFocusKey((k) => k + 1)
  }

  const createModel = (query: string) => {
    const id = query.trim()
    if (!isValidModelId(id)) {
      setModelIdError(raStrings.modelIdInvalid)
      return
    }
    edit((f) => ({ ...f, model: id }))
  }

  return {
    isAdmin,
    meLoading: me.isPending,
    loading: isAdmin && !stored.isError && (stored.isPending || !bootstrapped),
    loadFailed: isAdmin && stored.isError && !settings,
    settings,
    form,
    status: settings ? statusOf(settings) : undefined,
    keyRow: settings && form ? keyRowState(form, settings) : undefined,
    editable: settings?.secretKeyConfigured === true,
    dirty: Boolean(settings && form && isDirty(form, settings)),
    errors,
    notice,
    focusKey,
    now,
    edit,
    save,
    saving: stored.saving,
    cancel,
    removeKey,
    removing: stored.removing,
    replaceKey,
    models: {
      options: toModelOptions(choices.models, form?.model.trim() ?? ''),
      createLabel: createModelLabel,
      create: createModel,
      notice: choices.source === 'catalogue' ? choices.notice : undefined,
      failed: choices.failed,
      loading: choices.isPending,
      refreshing: choices.refreshing,
      canRefresh: canCall && !choices.refreshing,
      refresh: () => (settings && form ? choices.refresh(modelsRequest(form, settings)) : Promise.resolve()),
    },
    test: {
      canRun: canCall && !test.running,
      hint: settings && form ? unavailableHint(form, settings) : undefined,
      running: test.running,
      result: test.result,
      errorMessage: test.error === undefined ? undefined : mapTestError(test.error),
      run: () => (settings && form ? test.run(testRequest(form, settings)) : Promise.resolve()),
    },
  }
}
