import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotScript = path.join(repoRoot, "scripts", "screenshot.sh");

function writeExecutable(file: string, body: string): void {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

function createScreenshotFixture(): {
  root: string;
  log: string;
  script: string;
  codexHome: string;
  bin: string;
} {
  const root = mkdtempSync(path.join(os.tmpdir(), "venturedex-screenshot-test-"));
  const scripts = path.join(root, "scripts");
  const screenshots = path.join(root, "public", "screenshots");
  const codexHome = path.join(root, "codex-home");
  const wrapperDir = path.join(codexHome, "skills", "playwright", "scripts");
  const bin = path.join(root, "bin");
  const log = path.join(root, "playwright-commands.log");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(screenshots, { recursive: true });
  mkdirSync(wrapperDir, { recursive: true });
  mkdirSync(bin, { recursive: true });
  cpSync(screenshotScript, path.join(scripts, "screenshot.sh"));
  cpSync(path.join(repoRoot, "scripts", "load-local-env.sh"), path.join(scripts, "load-local-env.sh"));

  writeExecutable(
    path.join(wrapperDir, "playwright_cli.sh"),
    `#!/bin/bash
set -u
command_name=""
for arg in "$@"; do
  case "$arg" in
    open|resize|run-code|eval|close)
      command_name="$arg"
      break
      ;;
  esac
done
printf '%s\n' "$command_name" >> "$SCREENSHOT_TEST_LOG"
if [ "$command_name" = "open" ] && [ "\${SCREENSHOT_TEST_OPEN_STATUS:-0}" -ne 0 ]; then
  exit "$SCREENSHOT_TEST_OPEN_STATUS"
fi
if [ "$command_name" = "run-code" ] && [ "\${SCREENSHOT_TEST_WRITE_PNG:-0}" = "1" ]; then
  for arg in "$@"; do
    case "$arg" in
      *page.screenshot*) printf 'fake-png' > "$SCREENSHOT_TEST_TMP_PNG" ;;
    esac
  done
fi
exit 0
`,
  );
  writeExecutable(path.join(bin, "npx"), "#!/bin/sh\nexit 0\n");
  writeExecutable(path.join(bin, "pkill"), "#!/bin/sh\nexit 0\n");
  writeExecutable(
    path.join(bin, "cwebp"),
    `#!/bin/bash
set -u
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    shift
    output="$1"
  fi
  shift
done
[ -n "$output" ] || exit 2
printf 'fake-webp' > "$output"
`,
  );

  return {
    root,
    log,
    script: path.join(scripts, "screenshot.sh"),
    codexHome,
    bin,
  };
}

function runFixture(
  fixture: ReturnType<typeof createScreenshotFixture>,
  slug: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  return spawnSync("bash", [fixture.script, slug, "https://example.test"], {
    cwd: fixture.root,
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      CODEX_HOME: fixture.codexHome,
      CLOUDFLARE_API_TOKEN: "test-token",
      CLOUDFLARE_ACCOUNT_ID: "test-account",
      VENTUREDEX_LOCAL_ENV_LOADED: "1",
      PLAYWRIGHT_STEP_TIMEOUT_SECONDS: "5",
      PLAYWRIGHT_CLOSE_TIMEOUT_SECONDS: "5",
      SCREENSHOT_TEST_LOG: fixture.log,
      ...extraEnv,
    },
    encoding: "utf8",
  });
}

function extractOverlayCallbackBody(script: string): string {
  const startMarker = "const remainingOverlays = await page.evaluate(async () => {";
  const endMarker = "\n  });\n\n  if (remainingOverlays.length > 0)";
  const start = script.indexOf(startMarker);
  const end = script.indexOf(endMarker, start);
  assert.notEqual(start, -1, "bounded overlay callback is missing");
  assert.notEqual(end, -1, "bounded overlay callback is unterminated");
  return script
    .slice(start + startMarker.length, end)
    .replace("setTimeout(resolve, 500)", "setTimeout(resolve, 0)");
}

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type ElementStyle = {
  display: string;
  visibility: string;
  opacity: string;
  position: string;
  zIndex: string;
  backgroundColor: string;
  backgroundImage: string;
  boxShadow: string;
  backdropFilter: string;
  pointerEvents: string;
};

const defaultRect: Rect = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
};

const defaultStyle: ElementStyle = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  position: "static",
  zIndex: "auto",
  backgroundColor: "rgba(0, 0, 0, 0)",
  backgroundImage: "none",
  boxShadow: "none",
  backdropFilter: "none",
  pointerEvents: "auto",
};

function createFakeDom(options: { modal?: boolean } = {}) {
  let semanticScans = 0;
  let viewportHitTests = 0;
  let controlScans = 0;

  class FakeElement {
    tagName: string;
    textContent: string;
    id = "";
    className = "";
    parentElement: FakeElement | null = null;
    controls: FakeElement[] = [];
    rect: Rect;
    style: ElementStyle;
    attrs: Record<string, string>;

    constructor(
      tagName: string,
      rect: Rect,
      style: Partial<ElementStyle>,
      attrs: Record<string, string> = {},
      textContent = "",
    ) {
      this.tagName = tagName;
      this.rect = rect;
      this.style = { ...defaultStyle, ...style };
      this.attrs = attrs;
      this.textContent = textContent;
    }

    getAttribute(name: string): string | null {
      return this.attrs[name] ?? null;
    }

    hasAttribute(name: string): boolean {
      return Object.hasOwn(this.attrs, name);
    }

    getBoundingClientRect(): Rect {
      return this.rect;
    }

    contains(other: FakeElement): boolean {
      for (let current: FakeElement | null = other; current; current = current.parentElement) {
        if (current === this) return true;
      }
      return false;
    }

    querySelectorAll(): FakeElement[] {
      controlScans += 1;
      return this.controls;
    }

    click(): void {}
  }

  const body = new FakeElement("BODY", defaultRect, {});
  const documentElement = new FakeElement("HTML", defaultRect, {});
  const stickyHeader = new FakeElement(
    "HEADER",
    { left: 0, top: 0, right: 1440, bottom: 80, width: 1440, height: 80 },
    { position: "sticky", zIndex: "100", backgroundColor: "rgb(255, 255, 255)" },
    {},
    "Navigation",
  );
  const transparentLayer = new FakeElement(
    "DIV",
    { left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 },
    { position: "fixed", zIndex: "999", pointerEvents: "none" },
    { role: "dialog" },
  );
  const modal = new FakeElement(
    "DIV",
    { left: 320, top: 180, right: 1120, bottom: 720, width: 800, height: 540 },
    { position: "fixed", zIndex: "1000", backgroundColor: "rgb(255, 255, 255)" },
    { role: "dialog", "aria-modal": "true" },
    "Welcome",
  );

  const document = {
    body,
    documentElement,
    totalElementCount: 100_000,
    querySelectorAll(selector: string): FakeElement[] {
      semanticScans += 1;
      assert.match(selector, /\[role="dialog"\]/);
      return options.modal ? [modal] : [transparentLayer];
    },
    elementsFromPoint(): FakeElement[] {
      viewportHitTests += 1;
      return options.modal ? [modal] : [stickyHeader, transparentLayer];
    },
  };
  const window = {
    innerWidth: 1440,
    innerHeight: 900,
    scrollTo(): void {},
  };

  return {
    FakeElement,
    document,
    window,
    getComputedStyle: (element: FakeElement) => element.style,
    counts: () => ({ semanticScans, viewportHitTests, controlScans }),
  };
}

async function runOverlayCallback(fakeDom: ReturnType<typeof createFakeDom>) {
  const script = readFileSync(screenshotScript, "utf8");
  const body = extractOverlayCallbackBody(script);
  const buildCallback = new Function(
    "HTMLElement",
    "document",
    "window",
    "getComputedStyle",
    `return async () => {${body}\n};`,
  ) as (
    htmlElement: unknown,
    document: unknown,
    window: unknown,
    getComputedStyle: unknown,
  ) => () => Promise<Array<Record<string, unknown>>>;
  return buildCallback(
    fakeDom.FakeElement,
    fakeDom.document,
    fakeDom.window,
    fakeDom.getComputedStyle,
  )();
}

test("single-target Playwright failure exits nonzero, leaves no WebP, and closes once", () => {
  const fixture = createScreenshotFixture();
  const slug = `open-failure-${path.basename(fixture.root).replace(/\W/g, "")}`;
  try {
    const result = runFixture(fixture, slug, { SCREENSHOT_TEST_OPEN_STATUS: "23" });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /Playwright open timed out or errored/);
    assert.match(result.stdout, /FAILED \(popup detected or Playwright capture failed\)/);
    assert.equal(existsSync(path.join(fixture.root, "public", "screenshots", `${slug}.webp`)), false);
    assert.deepEqual(readFileSync(fixture.log, "utf8").trim().split("\n"), ["open", "close"]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(`/tmp/venturedex-screenshot-${slug}.png`, { force: true });
    rmSync(`/tmp/venturedex-screenshot-${slug}.webp`, { force: true });
  }
});

test("successful Playwright commands without an image still fail and leave no WebP", () => {
  const fixture = createScreenshotFixture();
  const slug = `no-image-${path.basename(fixture.root).replace(/\W/g, "")}`;
  try {
    const result = runFixture(fixture, slug);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /screenshot produced no PNG/);
    assert.equal(existsSync(path.join(fixture.root, "public", "screenshots", `${slug}.webp`)), false);
    assert.deepEqual(readFileSync(fixture.log, "utf8").trim().split("\n"), [
      "open",
      "resize",
      "run-code",
      "run-code",
      "close",
    ]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(`/tmp/venturedex-screenshot-${slug}.png`, { force: true });
    rmSync(`/tmp/venturedex-screenshot-${slug}.webp`, { force: true });
  }
});

test("successful capture survives session cleanup and emits a nonempty WebP", () => {
  const fixture = createScreenshotFixture();
  const slug = `success-${path.basename(fixture.root).replace(/\W/g, "")}`;
  const output = path.join(fixture.root, "public", "screenshots", `${slug}.webp`);
  const tmpPng = `/tmp/venturedex-screenshot-${slug}.png`;
  try {
    const result = runFixture(fixture, slug, {
      SCREENSHOT_TEST_WRITE_PNG: "1",
      SCREENSHOT_TEST_TMP_PNG: tmpPng,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /OK \(9 bytes → public\/screenshots\)/);
    assert.equal(readFileSync(output, "utf8"), "fake-webp");
    assert.deepEqual(readFileSync(fixture.log, "utf8").trim().split("\n"), [
      "open",
      "resize",
      "run-code",
      "run-code",
      "close",
    ]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(tmpPng, { force: true });
    rmSync(`/tmp/venturedex-screenshot-${slug}.webp`, { force: true });
  }
});

test("overlay discovery is bounded and does not use whole-page locator scans", () => {
  const script = readFileSync(screenshotScript, "utf8");
  assert.doesNotMatch(script, /querySelectorAll\(['"]body \*['"]\)/);
  assert.doesNotMatch(script, /page\.locator\(['"]\*['"]\)/);
  assert.doesNotMatch(script, /trap\s+\w+\s+RETURN/);
  assert.match(script, /const MAX_SEMANTIC_CANDIDATES = 48;/);
  assert.match(script, /const MAX_CANDIDATE_ELEMENTS = 96;/);
  assert.match(script, /const MAX_CANDIDATE_ROOTS = 16;/);
  assert.match(script, /const MAX_CONTROLS_PER_ROOT = 48;/);
  assert.match(script, /document\s*\.elementsFromPoint\(/);
  assert.match(script, /candidate\.el\.querySelectorAll\(CONTROL_SELECTOR\)/);
  assert.match(script, /throw new Error\('popup_detected:'/);
  assert.match(script, /if take_screenshot "\$1" "\$2"; then/);
});

test("100k-node contract stays bounded and ignores sticky headers and transparent layers", async () => {
  const fakeDom = createFakeDom();
  const remaining = await runOverlayCallback(fakeDom);
  assert.deepEqual(remaining, []);
  assert.equal(fakeDom.document.totalElementCount, 100_000);
  assert.deepEqual(fakeDom.counts(), {
    semanticScans: 2,
    viewportHitTests: 18,
    controlScans: 0,
  });
});

test("visible semantic modal remains fail-closed", async () => {
  const fakeDom = createFakeDom({ modal: true });
  const remaining = await runOverlayCallback(fakeDom);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.semantic_modal, true);
  assert.equal(remaining[0]?.role, "dialog");
  assert.deepEqual(fakeDom.counts(), {
    semanticScans: 2,
    viewportHitTests: 18,
    controlScans: 1,
  });
});
