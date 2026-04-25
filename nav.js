// Ensures the active top-nav pill is visible on narrow viewports where
// the 5-tab row scrolls horizontally. Without this, someone landing on
// the Appeals or About tab on a phone wouldn't see their own tab —
// it'd be offscreen to the right. Runs once on load; inert on desktop
// where all 5 tabs fit.
(() => {
  const current = document.querySelector('.site-nav-link[aria-current="page"]');
  if (!current || !current.scrollIntoView) return;
  // "nearest" on the block axis avoids any vertical scroll jump; "center"
  // on the inline axis positions the pill mid-nav so the neighbors on
  // either side are also discoverable.
  current.scrollIntoView({ inline: "center", block: "nearest" });
})();
