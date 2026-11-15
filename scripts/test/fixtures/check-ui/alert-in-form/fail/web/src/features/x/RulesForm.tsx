export function RulesForm({ a, b }: { a?: string; b?: string }) {
  return (
    <div>
      <form onSubmit={() => {}}>
        {a ? <p role='alert'>{a}</p> : null}
        {b ? <p role={"alert"}>{b}</p> : null}
      </form>
    </div>
  )
}
