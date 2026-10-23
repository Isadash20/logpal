import { Capacitor } from '@capacitor/core'

/**
 * Whether this build is running inside the native iOS shell (Capacitor)
 * rather than a browser. The same bundle serves both; a handful of places
 * behave differently, all of them about leaving and re-entering the app.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Where Supabase sends the browser back after OAuth on the phone.
 *
 * On the web the return address is the page itself. In the app there is no
 * page: sign-in opens the system browser (Google refuses to run inside an
 * embedded web view), so the return is a custom URL scheme that iOS hands
 * back to the app. `logpal` is registered in Info.plist, and this exact
 * string must be on Supabase's redirect allow-list.
 */
export const NATIVE_AUTH_REDIRECT = 'logpal://auth'
