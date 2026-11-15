// The one alert a form may have. It renders no <form>, and the rule skips this file anyway.
export function FormError({ children }: { children?: string }) {
  return children ? <p role="alert" className="form-error">{children}</p> : null
}
