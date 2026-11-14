// B9-03: how the driver puts a tab in a viewport. A viewport is { width, height, mobile, safeArea? } (page-layout-rules.mjs PROFILES
// and SCENARIO_VIEWPORTS). safeArea { top, right, bottom, left } in CSS px emulates a notched device (env(safe-area-inset-*)) through
// Emulation.setSafeAreaInsetsOverride, so a package can check content against the insets (the 844x390-inset scenario viewport).

/** The CDP calls, in order, that put a fresh tab in `vp`. */
export function emulationCalls(vp) {
  const calls = [{ method: 'Emulation.setDeviceMetricsOverride', params: { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile } }]
  if (vp.safeArea) {
    const { top, right, bottom, left } = vp.safeArea
    calls.push({ method: 'Emulation.setSafeAreaInsetsOverride', params: { insets: { top, left, bottom, right } } })
  }
  return calls
}
