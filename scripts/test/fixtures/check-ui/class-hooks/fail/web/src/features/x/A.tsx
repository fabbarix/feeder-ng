export const A = ({ v }: { v: string }) => (
  <div className="card undefined-one">
    <span className={`badge badge--${v}`} />
    <i className={v ? 'icon-on' : 'icon-off'} />
  </div>
)
