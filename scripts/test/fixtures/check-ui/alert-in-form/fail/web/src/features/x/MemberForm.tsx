export function MemberForm({ nameError }: { nameError?: string }) {
  return (
    <form>
      <input aria-label="Name" />
      {nameError ? <p className="settings__error" role="alert">{nameError}</p> : null}
    </form>
  )
}
