import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Drawer } from "vaul";

// Server-render the real dependency with React 19. Browser gestures are not covered here.
test("Vaul server-renders the closed drawer trigger with React 19", () => {
  const element = React.createElement;
  const html = renderToStaticMarkup(element(Drawer.Root, { shouldScaleBackground: true },
    element(Drawer.Trigger, { className: "drawer-trigger" }, "Open station details"),
    element(Drawer.Portal, null,
      element(Drawer.Overlay),
      element(Drawer.Content, null,
        element(Drawer.Title, null, "Station details"),
        element(Drawer.Description, null, "Latest weather readings"),
        element(Drawer.Close, null, "Close station details"),
      ),
    ),
  ));

  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /data-state="closed"/);
  assert.match(html, /class="drawer-trigger"/);
  assert.match(html, />Open station details<\/button>/);
  assert.doesNotMatch(html, /Latest weather readings/);
});
