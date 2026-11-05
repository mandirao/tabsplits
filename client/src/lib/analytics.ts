import posthog from "posthog-js";

// Publishable project key. Unset (local dev unless added to .env) means
// analytics stays off and every call below does nothing.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: false,
    // The PostHog project has replay switched on, but this app shows people's
    // bills and names. Recording them should be a deliberate decision, not a
    // side effect of analytics starting to work.
    disable_session_recording: true,
  });
}

// Whether this page load has identified someone. reset() gives the browser a
// new anonymous ID, and App.tsx calls it whenever nobody is logged in, including
// on every logged-out page load. Only resetting after a real identify keeps one
// anonymous visitor from counting as a new person on each load.
let identified = false;

export const analytics = {
  identify(userId: string, props: { email: string; name: string }) {
    if (!POSTHOG_KEY) return;
    identified = true;
    posthog.identify(userId, props);
  },

  reset() {
    if (!POSTHOG_KEY || !identified) return;
    identified = false;
    posthog.reset();
  },

  page(path: string) {
    if (!POSTHOG_KEY) return;
    posthog.capture("$pageview", {
      $current_url: window.location.origin + path,
    });
  },

  capture(event: string, properties?: Record<string, unknown>) {
    if (!POSTHOG_KEY) return;
    posthog.capture(event, properties);
  },
};
