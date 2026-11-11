import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { PageHeader, Tile } from '../../../ui'
import { ApiKeyRow } from '../components/ApiKeyRow'
import { AssistantToggleTile } from '../components/AssistantToggleTile'
import { ConnectionTile } from '../components/ConnectionTile'
import { ModelTile } from '../components/ModelTile'
import { RecentChangesTile } from '../components/RecentChangesTile'
import { SecretKeyMissingTile } from '../components/SecretKeyMissingTile'
import { SettingsActions } from '../components/SettingsActions'
import { TestConnectionTile } from '../components/TestConnectionTile'
import { useRecipeAssistantPage } from '../hooks/useRecipeAssistantPage'
import { raStrings } from '../strings'
import '../recipe-assistant.css'

/** /settings/recipe-assistant (Admin): switch, connection, key, model, Test connection and the change history. */
export function RecipeAssistantSettingsPage() {
  const page = useRecipeAssistantPage()
  const header = <PageHeader title={raStrings.title} breadcrumbs={useBreadcrumbs()} />
  const { settings, form, status, keyRow } = page

  if (page.meLoading || page.loading) {
    return (
      <div className="ra">
        {header}
        <p role="status" className="ra__muted">
          {raStrings.loading}
        </p>
      </div>
    )
  }
  if (!page.isAdmin) {
    return (
      <div className="ra">
        {header}
        <Tile as="section" span="full">
          <p>{raStrings.notAdmin}</p>
        </Tile>
      </div>
    )
  }
  if (!settings || !form || !status || !keyRow) {
    return (
      <div className="ra">
        {header}
        <p role="alert">{raStrings.loadError}</p>
      </div>
    )
  }

  const locked = !page.editable
  return (
    <div className="ra">
      {header}
      {locked ? <SecretKeyMissingTile /> : null}
      <AssistantToggleTile
        enabled={form.enabled}
        status={status}
        disabled={locked}
        error={page.errors.enabled}
        onChange={(enabled) => page.edit((f) => ({ ...f, enabled }))}
      />
      <ConnectionTile
        baseUrl={form.baseUrl}
        error={page.errors.baseUrl}
        disabled={locked}
        onBaseUrlChange={(baseUrl) => page.edit((f) => ({ ...f, baseUrl }))}
      >
        <ApiKeyRow
          state={keyRow}
          last4={settings.apiKeyLast4}
          value={form.apiKey}
          error={page.errors.apiKey}
          disabled={locked || page.removing}
          focusRequest={page.focusKey}
          onChange={(apiKey) => page.edit((f) => ({ ...f, apiKey }))}
          onReplace={page.replaceKey}
          onKeepSaved={() => page.edit((f) => ({ ...f, replacing: false, apiKey: '' }))}
          onRemove={() => void page.removeKey()}
        />
      </ConnectionTile>
      <ModelTile
        value={form.model.trim()}
        options={page.models.options}
        error={page.errors.model}
        notice={page.models.notice}
        failed={page.models.failed}
        disabled={locked || page.models.loading}
        canRefresh={page.models.canRefresh}
        createLabel={page.models.createLabel}
        onChange={(model) => page.edit((f) => ({ ...f, model }))}
        onCreate={page.models.create}
        onRefresh={() => void page.models.refresh()}
      />
      <TestConnectionTile
        canRun={page.test.canRun}
        running={page.test.running}
        hint={page.test.hint}
        result={page.test.result}
        errorMessage={page.test.errorMessage}
        onRun={() => void page.test.run()}
      />
      <RecentChangesTile changes={settings.changes} now={page.now} />
      <div role="status" aria-live="polite">
        {page.notice ? <p>{page.notice}</p> : null}
        {page.errors.form ? <p role="alert">{page.errors.form}</p> : null}
      </div>
      <SettingsActions dirty={page.dirty} canSave={page.dirty && !locked} saving={page.saving} onSave={() => void page.save()} onCancel={page.cancel} />
    </div>
  )
}
