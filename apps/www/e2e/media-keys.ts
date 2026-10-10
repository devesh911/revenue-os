// The test browser is a media app to the computer it runs on: on a Mac it becomes the
// "Now Playing" app once the sample call plays, so a media key, AirPods taken out or
// Control Center can pause or resume the recording mid-test, and a check that presses
// pause then sees it playing. Chromium hands those presses to the page's own play and
// pause handlers when it has them (MediaSessionImpl::Suspend and ::Resume), so these
// do nothing and only the page's own buttons move the recording. Pass it to
// page.addInitScript in every check that plays the recording.
export const ignoreMediaKeys = () => {
  for (const action of ["play", "pause"] as const)
    navigator.mediaSession.setActionHandler(action, () => {});
};
