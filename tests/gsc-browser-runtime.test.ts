import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeSource = readFileSync(
  path.join(repoRoot, "scripts", "gsc-browser-runtime.js"),
  "utf8",
).replace(/\r?\n/g, " ");

type RuntimeApi = {
  inspectTarget(expected: string, expectedRouteId?: string): string;
  clickTarget(
    expected: string,
    expectedRouteId: string,
    allowExistingStaticSuccess?: boolean,
    expectedPriorTerminal?: string,
  ): string;
  inspectionEntrySurface(expectedResourceId?: string): string;
  inspectionSurface(expectedResourceId?: string): string;
  requestState(expected?: string, expectedRouteId?: string): string;
  submitInspectionInput(expected: string): string;
};

type ElementOptions = {
  attributes?: Record<string, string>;
  rendered?: boolean;
  text?: string;
  value?: string;
};

class FakeElement {
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  disabled = false;
  clickCount = 0;
  focusCount = 0;
  readonly dispatchedEvents: string[] = [];
  rendered: boolean;
  value: string;
  private ownText: string;

  constructor(tagName: string, options: ElementOptions = {}) {
    this.tagName = tagName.toLowerCase();
    this.ownText = options.text ?? "";
    this.rendered = options.rendered ?? true;
    this.value = options.value ?? "";
    for (const [name, value] of Object.entries(options.attributes ?? {})) {
      this.attributes.set(name, value);
    }
  }

  append(...children: FakeElement[]): this {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
    return this;
  }

  get previousElementSibling(): FakeElement | null {
    if (!this.parentElement) return null;
    const index = this.parentElement.children.indexOf(this);
    return index > 0 ? this.parentElement.children[index - 1] : null;
  }

  get textContent(): string {
    return [this.ownText, ...this.children.map((child) => child.textContent)]
      .filter(Boolean)
      .join(" ");
  }

  get innerText(): string {
    return this.textContent;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  getClientRects(): Array<Record<string, never>> {
    let current: FakeElement | null = this;
    while (current) {
      if (
        !current.rendered
        || current.getAttribute("aria-hidden") === "true"
        || current.getAttribute("data-display") === "none"
        || current.getAttribute("data-visibility") === "hidden"
      ) {
        return [];
      }
      current = current.parentElement;
    }
    return [{}];
  }

  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;
    while (current) {
      if (matchesSelector(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  contains(candidate: FakeElement): boolean {
    return this === candidate
      || this.children.some((child) => child.contains(candidate));
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return descendantsOf(this).filter((element) => (
      matchesSelector(element, selector)
    ));
  }

  click(): void {
    this.clickCount += 1;
  }

  focus(): void {
    this.focusCount += 1;
  }

  dispatchEvent(event: { type: string }): boolean {
    this.dispatchedEvents.push(event.type);
    return true;
  }
}

class FakeDocument {
  readonly elements: FakeElement[];

  constructor(elements: FakeElement[]) {
    this.elements = elements;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return allElements(this.elements).filter((element) => (
      matchesSelector(element, selector)
    ));
  }
}

function descendantsOf(parent: FakeElement): FakeElement[] {
  return parent.children.flatMap((child) => [child, ...descendantsOf(child)]);
}

function allElements(roots: FakeElement[]): FakeElement[] {
  return roots.flatMap((root) => [root, ...descendantsOf(root)]);
}

function matchesSelector(element: FakeElement, selector: string): boolean {
  return selector.split(",").some((part) => {
    const compound = part.trim();
    if (compound === "*") return true;

    const tag = compound.match(/^[a-z][a-z0-9-]*/i)?.[0]?.toLowerCase();
    if (tag && element.tagName !== tag) return false;

    const classNames = [...compound.matchAll(/\.([A-Za-z0-9_-]+)/g)]
      .map((match) => match[1]);
    const actualClasses = new Set(
      String(element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
    );
    if (classNames.some((className) => !actualClasses.has(className))) {
      return false;
    }

    const attributes = [...compound.matchAll(
      /\[([A-Za-z0-9_-]+)(?:(\*=|=)"([^"]*)")?\]/g,
    )];
    return attributes.every(([, name, operator, expected]) => {
      const actual = element.getAttribute(name);
      if (!operator) return actual !== null;
      if (actual === null) return false;
      return operator === "*=" ? actual.includes(expected) : actual === expected;
    });
  });
}

function createInput(value = ""): FakeElement {
  return new FakeElement("input", {
    attributes: {
      "aria-label": "Inspect any URL in venturedex.co",
      role: "combobox",
    },
    value,
  });
}

function createInspectionRoot(
  inspectedUrl: string,
  routeId: string,
  options: { rendered?: boolean; stateText?: string } = {},
): { button: FakeElement; root: FakeElement } {
  const urlLeaf = new FakeElement("span", { text: inspectedUrl });
  const fullUrl = new FakeElement("span", {
    attributes: { jsname: "us8Fnf" },
    text: inspectedUrl,
  });
  const toggle = new FakeElement("div", {
    attributes: { jsname: "LgbsSe", role: "button" },
    text: "Show inspected URL",
  });
  const header = new FakeElement("div").append(urlLeaf, fullUrl, toggle);

  const button = new FakeElement("button", {
    attributes: { role: "button" },
    text: "Request indexing",
  });
  const action = new FakeElement("div", {
    attributes: { "data-event-action": "request-indexing" },
  }).append(button);
  const resultBranch = new FakeElement("section").append(action);
  const primaryBranch = new FakeElement("main").append(header, resultBranch);
  const root = new FakeElement("c-wiz", {
    attributes: {
      "aria-busy": "false",
      "data-p": `active-route:${routeId}`,
      jsname: "a9kxte",
      jsrenderer: "jtca7c",
    },
    rendered: options.rendered,
    text: options.stateText,
  }).append(primaryBranch);

  return { button, root };
}

function createDialog(text: string, ariaModal?: string): FakeElement {
  return new FakeElement("div", {
    attributes: {
      role: "dialog",
      ...(ariaModal === undefined ? {} : { "aria-modal": ariaModal }),
    },
    text,
  });
}

function inspectionHref(routeId: string): string {
  return `https://search.google.com/search-console/inspect?resource_id=sc-domain%3Aventuredex.co&id=${encodeURIComponent(routeId)}`;
}

function loadRuntime(
  document: FakeDocument,
  routeId: string,
  href = inspectionHref(routeId),
): {
  api: RuntimeApi;
  location: { href: string };
} {
  class FakeEvent {
    readonly type: string;

    constructor(type: string) {
      this.type = type;
    }
  }
  class FakeHtmlInputElement {}
  Object.defineProperty(FakeHtmlInputElement.prototype, "value", {
    set(this: FakeElement, value: string) {
      this.value = String(value);
    },
  });
  const location = { href };
  const context = vm.createContext({
    Event: FakeEvent,
    HTMLInputElement: FakeHtmlInputElement,
    KeyboardEvent: FakeEvent,
    URL,
    document,
    getComputedStyle(element: FakeElement) {
      return {
        display: element.getAttribute("data-display") ?? "block",
        visibility: element.getAttribute("data-visibility") ?? "visible",
      };
    },
    location,
  });
  vm.runInContext(runtimeSource, context, {
    filename: "scripts/gsc-browser-runtime.js",
  });
  const api = (context as vm.Context & {
    __VENTUREDEX_GSC__: RuntimeApi;
  }).__VENTUREDEX_GSC__;
  assert.ok(api, "runtime must install __VENTUREDEX_GSC__");
  return { api, location };
}

test("runtime inspects an exact URL with a cleared input and clicks once", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const routeId = "route-alpha";
  const { button, root } = createInspectionRoot(expected, routeId);
  const { api } = loadRuntime(
    new FakeDocument([createInput(""), root]),
    routeId,
  );

  assert.equal(
    api.inspectionEntrySurface(),
    "inspection_entry_surface_ready",
  );
  assert.equal(api.inspectionSurface(), "inspection_surface_ready");
  assert.equal(
    api.inspectTarget(expected),
    `inspection_target_match|||${routeId}`,
  );
  assert.equal(api.clickTarget(expected, routeId), "clicked");
  assert.equal(button.clickCount, 1);
});

test("runtime accepts only the exact VentureDex Overview as an initial entry surface", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const routeId = "route-alpha";
  const input = createInput("");
  const stale = createInspectionRoot(expected, routeId);
  const { api, location } = loadRuntime(
    new FakeDocument([input, stale.root]),
    routeId,
    "https://search.google.com/search-console?resource_id=sc-domain%3Aventuredex.co",
  );

  assert.equal(
    api.inspectionEntrySurface(),
    "inspection_entry_surface_ready",
  );
  assert.equal(
    api.inspectionSurface(),
    "gsc_inspection_surface_blocker|||https://search.google.com/search-console",
  );
  assert.match(api.inspectTarget(expected), /^gsc_inspection_surface_blocker/);
  assert.match(
    api.clickTarget(expected, routeId),
    /^gsc_inspection_surface_blocker/,
  );
  assert.equal(stale.button.clickCount, 0);

  assert.equal(api.submitInspectionInput(expected), "submitted");
  assert.equal(input.value, expected);
  assert.equal(input.focusCount, 1);
  assert.deepEqual(input.dispatchedEvents, [
    "input",
    "change",
    "input",
    "change",
    "keydown",
    "keyup",
  ]);

  location.href =
    "https://search.google.com/search-console?resource_id=sc-domain%3Awrong.example";
  assert.match(api.inspectionEntrySurface(), /^gsc_inspection_surface_blocker/);
  location.href =
    "https://search.google.com/search-console?resource_id=sc-domain%3Aventuredex.co&unexpected=1";
  assert.match(api.inspectionEntrySurface(), /^gsc_inspection_surface_blocker/);
  location.href =
    "https://search.google.com/search-console?resource_id=sc-domain%3Aventuredex.co#settings";
  assert.match(api.inspectionEntrySurface(), /^gsc_inspection_surface_blocker/);
  location.href =
    "https://search.google.com/search-console/settings?resource_id=sc-domain%3Aventuredex.co";
  assert.match(api.inspectionEntrySurface(), /^gsc_inspection_surface_blocker/);
  location.href = "https://accounts.google.com/v3/signin/identifier";
  assert.match(api.inspectionEntrySurface(), /^gsc_auth_session_blocker/);
});

test("runtime requires one unique visible global inspection input on entry", () => {
  const routeId = "route-alpha";
  const overview =
    "https://search.google.com/search-console?resource_id=sc-domain%3Aventuredex.co&hl=zh-cn";
  const duplicate = loadRuntime(
    new FakeDocument([createInput(""), createInput("")]),
    routeId,
    overview,
  );
  assert.match(
    duplicate.api.inspectionEntrySurface(),
    /^gsc_inspection_surface_blocker/,
  );

  const unrelated = new FakeElement("input", {
    attributes: {
      "aria-label": "Search venturedex.co",
      role: "combobox",
    },
  });
  const wrongCombobox = loadRuntime(
    new FakeDocument([unrelated]),
    routeId,
    overview,
  );
  assert.match(
    wrongCombobox.api.inspectionEntrySurface(),
    /^gsc_inspection_surface_blocker/,
  );

  const hidden = createInput("");
  hidden.rendered = false;
  const visible = createInput("");
  const unique = loadRuntime(
    new FakeDocument([hidden, visible]),
    routeId,
    overview,
  );
  assert.equal(
    unique.api.inspectionEntrySurface(),
    "inspection_entry_surface_ready",
  );

  const chinese = new FakeElement("input", {
    attributes: {
      "aria-label": "检查 venturedex.co 中的任意网址",
      role: "combobox",
    },
  });
  const localized = loadRuntime(
    new FakeDocument([chinese]),
    routeId,
    overview,
  );
  assert.equal(
    localized.api.inspectionEntrySurface(),
    "inspection_entry_surface_ready",
  );
});

test("runtime rejects auth redirects, wrong properties, and missing inspection inputs", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const routeId = "route-alpha";
  const { button, root } = createInspectionRoot(expected, routeId);
  const { api, location } = loadRuntime(
    new FakeDocument([createInput(""), root]),
    routeId,
  );

  location.href = "https://accounts.google.com/v3/signin/identifier";
  assert.equal(
    api.inspectionEntrySurface(),
    "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier",
  );
  assert.equal(
    api.inspectionSurface(),
    "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier",
  );
  assert.match(api.inspectTarget(expected), /^gsc_auth_session_blocker/);
  assert.equal(
    api.requestState(expected, routeId),
    "gsc_auth_session_blocker|||https://accounts.google.com/v3/signin/identifier",
  );
  assert.equal(button.clickCount, 0);

  location.href =
    "https://search.google.com/search-console/inspect?resource_id=sc-domain%3Awrong.example";
  assert.equal(
    api.inspectionSurface(),
    "gsc_inspection_surface_blocker|||https://search.google.com/search-console/inspect",
  );

  const noInput = loadRuntime(new FakeDocument([root]), routeId);
  assert.equal(
    noInput.api.inspectionSurface(),
    "gsc_inspection_surface_blocker|||https://search.google.com/search-console/inspect",
  );
});

test("runtime rejects a hidden stale target when the visible root is wrong", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const wrong = "https://venturedex.co/startups/wrong";
  const routeId = "route-alpha";
  const hidden = createInspectionRoot(expected, routeId, { rendered: false });
  const visibleWrong = createInspectionRoot(wrong, routeId);
  const { api } = loadRuntime(
    new FakeDocument([createInput(""), hidden.root, visibleWrong.root]),
    routeId,
  );

  assert.equal(api.inspectTarget(expected), "inspection_header_url_mismatch");
  assert.equal(
    api.clickTarget(expected, routeId),
    "inspection_header_url_mismatch",
  );
  assert.equal(hidden.button.clickCount, 0);
  assert.equal(visibleWrong.button.clickCount, 0);
});

test("runtime refuses to click after the inspection route changes", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const oldRouteId = "route-alpha";
  const { button, root } = createInspectionRoot(expected, oldRouteId);
  const { api, location } = loadRuntime(
    new FakeDocument([createInput(""), root]),
    oldRouteId,
  );

  assert.equal(
    api.inspectTarget(expected),
    `inspection_target_match|||${oldRouteId}`,
  );
  location.href = inspectionHref("route-wrong");
  assert.equal(
    api.clickTarget(expected, oldRouteId),
    "inspection_route_id_changed",
  );
  assert.equal(button.clickCount, 0);
});

test("runtime rejects duplicate inspection route ids before input or click", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const routeId = "route-alpha";
  const { button, root } = createInspectionRoot(expected, routeId);
  const { api, location } = loadRuntime(
    new FakeDocument([createInput(""), root]),
    routeId,
  );

  location.href = `${inspectionHref(routeId)}&id=route-other`;
  assert.match(
    api.inspectionEntrySurface(),
    /^gsc_inspection_surface_blocker/,
  );
  assert.equal(
    api.inspectTarget(expected, routeId),
    "inspection_route_id_ambiguous",
  );
  assert.equal(
    api.clickTarget(expected, routeId),
    "inspection_route_id_ambiguous",
  );
  assert.equal(button.clickCount, 0);
});

test("runtime atomically refuses terminal state that appears before the click", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const routeId = "route-alpha";
  const scenarios = [
    {
      stateText: "Indexing requested",
      marker: "preclick_terminal|||success_static",
    },
    {
      stateText: "Quota exceeded",
      marker: "preclick_terminal|||quota",
    },
    {
      stateText: "Indexing requested quota exceeded",
      marker: "preclick_terminal|||conflict",
    },
  ];

  for (const scenario of scenarios) {
    const { button, root } = createInspectionRoot(expected, routeId, {
      stateText: scenario.stateText,
    });
    const { api } = loadRuntime(
      new FakeDocument([createInput(""), root]),
      routeId,
    );

    assert.equal(api.clickTarget(expected, routeId), scenario.marker);
    assert.equal(button.clickCount, 0);
  }

  const forced = createInspectionRoot(expected, routeId, {
    stateText: "Indexing requested",
  });
  const forcedRuntime = loadRuntime(
    new FakeDocument([createInput(""), forced.root]),
    routeId,
  );
  assert.equal(
    forcedRuntime.api.clickTarget(expected, routeId, true),
    "clicked",
  );
  assert.equal(forced.button.clickCount, 1);

  const retryableFailure = createInspectionRoot(expected, routeId, {
    stateText: "Request failed",
  });
  const retryRuntime = loadRuntime(
    new FakeDocument([createInput(""), retryableFailure.root]),
    routeId,
  );
  assert.equal(
    retryRuntime.api.clickTarget(expected, routeId, false, "failed"),
    "clicked",
  );
  assert.equal(retryableFailure.button.clickCount, 1);
});

test("runtime request state prioritizes visible dialogs and detects conflicts", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const routeId = "route-alpha";

  {
    const { root } = createInspectionRoot(expected, routeId, {
      stateText: "Indexing requested",
    });
    const { api } = loadRuntime(
      new FakeDocument([root, createDialog("Something went wrong")]),
      routeId,
    );
    assert.equal(api.requestState(), "failed");
  }

  {
    const { root } = createInspectionRoot(expected, routeId);
    const { api } = loadRuntime(
      new FakeDocument([
        root,
        createDialog("Indexing requested. Something went wrong."),
      ]),
      routeId,
    );
    assert.equal(api.requestState(), "conflict");
  }

  {
    const { root } = createInspectionRoot(expected, routeId, {
      stateText: "Indexing requested. Quota exceeded.",
    });
    const { api } = loadRuntime(new FakeDocument([root]), routeId);
    assert.equal(api.requestState(), "conflict");
  }

  {
    const { root } = createInspectionRoot(expected, routeId, {
      stateText: "Indexing requested",
    });
    const { api } = loadRuntime(new FakeDocument([root]), routeId);
    assert.equal(api.requestState(), "success_static");
  }

  {
    const { root } = createInspectionRoot(expected, routeId);
    const { api } = loadRuntime(
      new FakeDocument([root, createDialog("Indexing requested")]),
      routeId,
    );
    assert.equal(api.requestState(), "success");
  }
});

test("runtime excludes the persistent aria-modal=false drawer and binds state to the target route", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const routeId = "route-alpha";
  const { root } = createInspectionRoot(expected, routeId);
  const persistentDrawer = createDialog("Indexing requested", "false");
  const { api, location } = loadRuntime(
    new FakeDocument([createInput(""), persistentDrawer, root]),
    routeId,
  );

  assert.equal(api.requestState(expected, routeId), "unknown");
  location.href = inspectionHref("route-wrong");
  assert.equal(api.requestState(expected, routeId), "target_changed");
});

test("runtime rejects two visible active roots as ambiguous", () => {
  const expected = "https://venturedex.co/startups/alpha";
  const routeId = "route-alpha";
  const first = createInspectionRoot(expected, routeId);
  const second = createInspectionRoot(expected, routeId);
  const { api } = loadRuntime(
    new FakeDocument([createInput(""), first.root, second.root]),
    routeId,
  );

  assert.equal(
    api.inspectTarget(expected),
    "inspection_active_root_ambiguous",
  );
  assert.equal(
    api.clickTarget(expected, routeId),
    "inspection_active_root_ambiguous",
  );
  assert.equal(first.button.clickCount, 0);
  assert.equal(second.button.clickCount, 0);
});
