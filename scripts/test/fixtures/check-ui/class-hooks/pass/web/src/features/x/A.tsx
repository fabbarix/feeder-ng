export const A = ({ v }: { v: string }) => (
  <div className="card js-hook">
    <span className={`badge badge--${v}`} />
    <i className={v ? 'icon-on' : 'icon-off'} />
    <b className={['card', 'card--wide'].join(' ')} />
  </div>
)
