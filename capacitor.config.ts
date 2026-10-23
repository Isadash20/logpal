import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The native shell around the web app.
 *
 * `dist` (the Vite build, food database included) is copied into the app
 * bundle on `cap sync`, so the whole app, search and all, works with no
 * network. Supabase and Open Food Facts are the only calls that leave the
 * device, the same as on the web.
 *
 * The bundle id is a placeholder until the Apple Developer account exists;
 * it has to match the App ID registered there, and it cannot change after
 * the first App Store upload.
 */
const config: CapacitorConfig = {
  appId: 'com.logpal.app',
  appName: 'LogPal',
  webDir: 'dist',
  /* Painted behind the web view until the page draws, so launch goes from
     the splash to the app's own ground rather than through a black frame. */
  backgroundColor: '#f4f4f7',
  ios: {
    /* The web app draws its own safe areas (viewport-fit=cover and the
       env() insets), so the WebView runs edge to edge. */
    contentInset: 'never',
    /* Short names for the Xcode scheme and the SPM package. */
    scheme: 'LogPal',
  },
  plugins: {
    /* The sign-in browser is the system one (SFSafariViewController), which
       Google requires: it refuses OAuth inside an embedded web view. */
    Browser: {},
  },
}

export default config
