(function installVentureDexGscRuntime(global) {
  "use strict";

  function visible(element) {
    if (
      !element
      || !element.getClientRects
      || element.getClientRects().length === 0
    ) {
      return false;
    }
    if (element.closest('[aria-hidden="true"]')) return false;
    const style = global.getComputedStyle
      ? global.getComputedStyle(element)
      : null;
    return !style
      || (style.display !== "none" && style.visibility !== "hidden");
  }

  function normalizeUrl(raw) {
    try {
      const parsed = new global.URL(String(raw || "").trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }
      const path = parsed.pathname.replace(/\/+$/, "") || "/";
      return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
    } catch {
      return "";
    }
  }

  function propertyName(expectedResourceId) {
    const prefix = "sc-domain:";
    return String(expectedResourceId || "").startsWith(prefix)
      ? String(expectedResourceId).slice(prefix.length).toLowerCase()
      : "";
  }

  function visibleInspectionInputs(expectedResourceId = "sc-domain:venturedex.co") {
    const expectedProperty = propertyName(expectedResourceId);
    if (!expectedProperty) return [];
    return Array.from(global.document.querySelectorAll(
      'input[role="combobox"][aria-label]',
    )).filter((input) => {
      const label = String(input.getAttribute("aria-label") || "").toLowerCase();
      return (
        visible(input)
        && label.includes(expectedProperty)
        && (label.includes("inspect any url") || label.includes("检查"))
      );
    });
  }

  function surfaceLocation() {
    try {
      return new global.URL(global.location.href);
    } catch {
      return null;
    }
  }

  function surfaceBlocker(current, expectedResourceId) {
    const observed = current
      ? `${current.origin}${current.pathname}`
      : "invalid_location";
    if (!current) {
      return `gsc_inspection_surface_blocker|||${observed}`;
    }
    if (current.origin !== "https://search.google.com") {
      return `gsc_auth_session_blocker|||${observed}`;
    }
    if (
      current.searchParams.getAll("resource_id").length !== 1
      || current.searchParams.get("resource_id") !== expectedResourceId
    ) {
      return `gsc_inspection_surface_blocker|||${observed}`;
    }
    return "";
  }

  function inspectionEntrySurface(
    expectedResourceId = "sc-domain:venturedex.co",
  ) {
    const current = surfaceLocation();
    const blocker = surfaceBlocker(current, expectedResourceId);
    if (blocker) return blocker;

    const isInspection = (
      current.pathname === "/search-console/inspect"
      && current.searchParams.getAll("id").length <= 1
    );
    const isExactOverview = (
      current.pathname === "/search-console"
      && current.hash === ""
      && !current.searchParams.has("id")
      && Array.from(current.searchParams.keys()).every((key) => (
        key === "resource_id" || key === "hl"
      ))
      && current.searchParams.getAll("hl").length <= 1
    );
    if (!isInspection && !isExactOverview) {
      return `gsc_inspection_surface_blocker|||${current.origin}${current.pathname}`;
    }

    return visibleInspectionInputs(expectedResourceId).length === 1
      ? "inspection_entry_surface_ready"
      : `gsc_inspection_surface_blocker|||${current.origin}${current.pathname}`;
  }

  function inspectionSurface(expectedResourceId = "sc-domain:venturedex.co") {
    const current = surfaceLocation();
    const blocker = surfaceBlocker(current, expectedResourceId);
    if (blocker) return blocker;
    const observed = `${current.origin}${current.pathname}`;
    if (current.pathname !== "/search-console/inspect") {
      return `gsc_inspection_surface_blocker|||${observed}`;
    }
    return visibleInspectionInputs(expectedResourceId).length === 1
      ? "inspection_surface_ready"
      : `gsc_inspection_surface_blocker|||${observed}`;
  }

  function submitInspectionInput(expected) {
    const surface = inspectionEntrySurface();
    if (surface !== "inspection_entry_surface_ready") return surface;

    const normalizedExpected = normalizeUrl(expected);
    if (!normalizedExpected) return "inspection_expected_invalid";
    const inputs = visibleInspectionInputs();
    if (inputs.length !== 1) return "inspection_input_ambiguous";
    const input = inputs[0];
    const valueDescriptor = global.HTMLInputElement
      ? Object.getOwnPropertyDescriptor(
        global.HTMLInputElement.prototype,
        "value",
      )
      : null;
    if (
      !valueDescriptor
      || typeof valueDescriptor.set !== "function"
      || typeof input.focus !== "function"
      || typeof input.dispatchEvent !== "function"
      || typeof global.Event !== "function"
      || typeof global.KeyboardEvent !== "function"
    ) {
      return "inspection_input_unavailable";
    }

    input.focus();
    valueDescriptor.set.call(input, "");
    input.dispatchEvent(new global.Event("input", { bubbles: true }));
    input.dispatchEvent(new global.Event("change", { bubbles: true }));
    valueDescriptor.set.call(input, normalizedExpected);
    input.dispatchEvent(new global.Event("input", { bubbles: true }));
    input.dispatchEvent(new global.Event("change", { bubbles: true }));
    input.dispatchEvent(new global.KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
    }));
    input.dispatchEvent(new global.KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
    }));
    return "submitted";
  }

  function currentInspection(expected, expectedRouteId = "") {
    const surface = inspectionSurface();
    if (surface !== "inspection_surface_ready") {
      return { ok: false, reason: surface };
    }
    const normalizedExpected = normalizeUrl(expected);
    if (!normalizedExpected) {
      return { ok: false, reason: "inspection_expected_invalid" };
    }

    const [input] = visibleInspectionInputs();
    if (
      input
      && String(input.value || "").trim()
      && normalizeUrl(input.value) !== normalizedExpected
    ) {
      return { ok: false, reason: "inspection_input_mismatch" };
    }

    const routeIds = new global.URL(global.location.href).searchParams.getAll(
      "id",
    );
    if (routeIds.length === 0) {
      return { ok: false, reason: "inspection_route_id_missing" };
    }
    if (routeIds.length !== 1) {
      return { ok: false, reason: "inspection_route_id_ambiguous" };
    }
    const [routeId] = routeIds;
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(routeId)) {
      return { ok: false, reason: "inspection_route_id_invalid" };
    }
    if (expectedRouteId && routeId !== expectedRouteId) {
      return { ok: false, reason: "inspection_route_id_changed" };
    }

    const roots = Array.from(global.document.querySelectorAll(
      'c-wiz[jsrenderer="jtca7c"][jsname="a9kxte"][data-p]',
    )).filter((root) => (
      visible(root)
      && root.getAttribute("aria-busy") !== "true"
      && String(root.getAttribute("data-p") || "").includes(routeId)
    ));
    if (roots.length !== 1) {
      return { ok: false, reason: "inspection_active_root_ambiguous" };
    }

    const root = roots[0];
    const actions = Array.from(root.querySelectorAll(
      '[data-event-action="request-indexing"]',
    )).filter(visible);
    if (actions.length !== 1) {
      return { ok: false, reason: "inspection_request_action_ambiguous" };
    }

    const primaryBranches = Array.from(root.children).filter((child) => (
      child.contains(actions[0])
    ));
    if (primaryBranches.length !== 1) {
      return { ok: false, reason: "inspection_primary_branch_ambiguous" };
    }

    const resultBranches = Array.from(primaryBranches[0].children).filter(
      (child) => child.contains(actions[0]),
    );
    if (resultBranches.length !== 1) {
      return { ok: false, reason: "inspection_result_branch_ambiguous" };
    }

    const header = resultBranches[0].previousElementSibling;
    if (!header || !visible(header)) {
      return { ok: false, reason: "inspection_header_missing" };
    }

    const fullNodes = Array.from(header.querySelectorAll('[jsname="us8Fnf"]'));
    const toggles = Array.from(header.querySelectorAll(
      '[role="button"][jsname="LgbsSe"]',
    ));
    if (fullNodes.length !== 1 || toggles.length !== 1) {
      return { ok: false, reason: "inspection_header_structure_mismatch" };
    }

    const visibleHeaderUrls = Array.from(header.querySelectorAll("*"))
      .filter((element) => (
        visible(element)
        && element.children.length === 0
        && /^https?:\/\//i.test(String(element.textContent || "").trim())
      ))
      .map((element) => normalizeUrl(element.textContent));
    const fullUrl = normalizeUrl(fullNodes[0].textContent);
    const headerUrls = [...visibleHeaderUrls, fullUrl];
    if (
      visibleHeaderUrls.length === 0
      || headerUrls.some((candidate) => (
        !candidate || candidate !== normalizedExpected
      ))
    ) {
      return { ok: false, reason: "inspection_header_url_mismatch" };
    }

    return {
      ok: true,
      routeId,
      root,
      action: actions[0],
      normalizedExpected,
    };
  }

  function inspectTarget(expected, expectedRouteId = "") {
    const inspection = currentInspection(expected, expectedRouteId);
    return inspection.ok
      ? `inspection_target_match|||${inspection.routeId}`
      : inspection.reason;
  }

  function clickTarget(
    expected,
    expectedRouteId,
    allowExistingStaticSuccess = false,
    expectedPriorTerminal = "",
  ) {
    const inspection = currentInspection(expected, expectedRouteId);
    if (!inspection.ok) return inspection.reason;

    const terminalState = terminalStateForRoot(inspection.root);
    if (
      terminalState !== "unknown"
      && !(allowExistingStaticSuccess && terminalState === "success_static")
      && !(expectedPriorTerminal === "failed" && terminalState === "failed")
    ) {
      return `preclick_terminal|||${terminalState}`;
    }
    const wholePageText = global.document.body
      ? global.document.body.innerText || global.document.body.textContent || ""
      : "";
    if (/(quota|配额)/i.test(wholePageText)) {
      return "preclick_terminal|||quota";
    }

    const buttons = Array.from(inspection.action.querySelectorAll(
      '[role="button"],button',
    )).filter((element) => (
      visible(element)
      && element.getAttribute("aria-disabled") !== "true"
      && !element.disabled
    ));
    if (buttons.length !== 1) return "request_button_ambiguous";
    buttons[0].click();
    return "clicked";
  }

  function stateFor(text, suffix = "") {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    const quota = /(quota|配额)/i.test(normalized);
    const failed = /(request failed|couldn.?t request|unable to request|something went wrong|失败|无法|出错)/i.test(normalized);
    const success = /(indexing requested|request submitted|request was submitted|已请求编入索引|已请求|请求[^。\n]*已提交|已提交[^。\n]*请求)/i.test(normalized);
    if ((quota || failed) && success) return "conflict";
    if (quota) return "quota";
    if (failed) return "failed";
    if (success) return `success${suffix}`;
    return "unknown";
  }

  function terminalStateForRoot(root) {
    const dialogs = Array.from(global.document.querySelectorAll(
      '[role="dialog"],[aria-modal="true"],material-dialog',
    )).filter((dialog) => (
      visible(dialog)
      /* Search Console's persistent aria-modal=false application drawer is not
         a request terminal. Keep comments safe when this file is flattened. */
      && dialog.getAttribute("aria-modal") !== "false"
      && !dialog.contains(root)
    ));
    if (dialogs.length) {
      const dialogState = stateFor(
        dialogs.map((element) => (
          element.innerText || element.textContent || ""
        )).join(" "),
      );
      if (dialogState !== "unknown") return dialogState;
    }

    const rootState = stateFor(
      root.innerText || root.textContent || "",
      "_static",
    );
    return ["success_static", "failed", "quota", "conflict"].includes(rootState)
      ? rootState
      : "unknown";
  }

  function requestState(expected = "", expectedRouteId = "") {
    let root;
    if (expected) {
      const inspection = currentInspection(expected, expectedRouteId);
      if (!inspection.ok) {
        return String(inspection.reason || "").startsWith("gsc_")
          ? inspection.reason
          : "target_changed";
      }
      root = inspection.root;
    } else {
      const routeIds = new global.URL(global.location.href).searchParams.getAll(
        "id",
      );
      if (routeIds.length !== 1) return "unknown";
      const [routeId] = routeIds;
      const roots = Array.from(global.document.querySelectorAll(
        'c-wiz[jsrenderer="jtca7c"][jsname="a9kxte"][data-p]',
      )).filter((candidate) => (
        visible(candidate)
        && candidate.getAttribute("aria-busy") !== "true"
        && String(candidate.getAttribute("data-p") || "").includes(routeId)
      ));
      if (roots.length !== 1) return "unknown";
      [root] = roots;
    }

    return terminalStateForRoot(root);
  }

  global.__VENTUREDEX_GSC__ = Object.freeze({
    clickTarget,
    inspectTarget,
    inspectionEntrySurface,
    inspectionSurface,
    requestState,
    submitInspectionInput,
  });
})(globalThis);
