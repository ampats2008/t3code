// MAIN world fiber reader — the only script that runs in the page's JS context.
// Reads React fiber info from elements tagged by the isolated world content
// script, and writes the result back via a shared DOM attribute.
//
// Communication protocol (synchronous via dispatchEvent):
//   1. Content script sets [data-t3code-target] on the element
//   2. Content script dispatches "__t3code-read-fiber" event on document
//   3. This listener fires synchronously, reads fiber, writes result to
//      <html data-t3code-fiber-result="...">
//   4. Content script reads the attribute and cleans up

import { getReactFiberInfo } from "@t3tools/shared/elementInspectorCore";

const GUARD = "__t3codeFiberReaderLoaded";
if (!(window as any)[GUARD]) {
  (window as any)[GUARD] = true;

  document.addEventListener("__t3code-read-fiber", () => {
    const el = document.querySelector("[data-t3code-target]");
    if (!el) {
      document.documentElement.removeAttribute("data-t3code-fiber-result");
      return;
    }
    const info = getReactFiberInfo(el);
    document.documentElement.setAttribute(
      "data-t3code-fiber-result",
      JSON.stringify(info)
    );
  });
}
