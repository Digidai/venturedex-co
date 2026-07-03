import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_TYPE,
  SOCIAL_IMAGE_WIDTH,
  normalizeTwitterHandle,
  resolveSocialPreviewMeta,
} from "../src/lib/social-meta";

const SITE_URL = "https://venturedex.co";

test("default social preview image is complete for X and LinkedIn unfurls", () => {
  const meta = resolveSocialPreviewMeta({
    title: "Curated Startup Directory",
    siteUrl: SITE_URL,
  });

  assert.equal(meta.imageUrl, `${SITE_URL}/og-image.png`);
  assert.equal(meta.imageSecureUrl, `${SITE_URL}/og-image.png`);
  assert.equal(meta.imageWidth, SOCIAL_IMAGE_WIDTH);
  assert.equal(meta.imageHeight, SOCIAL_IMAGE_HEIGHT);
  assert.equal(meta.imageType, SOCIAL_IMAGE_TYPE);
  assert.equal(meta.imageAlt, "Curated Startup Directory on VentureDex");
});

test("custom social images keep explicit dimensions and type", () => {
  const meta = resolveSocialPreviewMeta({
    title: "AI Is Taking the Operations Seat",
    siteUrl: SITE_URL,
    image: "/og/weekly-4.png",
    imageWidth: 1200,
    imageHeight: 630,
    imageType: "image/png",
  });

  assert.equal(meta.imageUrl, `${SITE_URL}/og/weekly-4.png`);
  assert.equal(meta.imageSecureUrl, `${SITE_URL}/og/weekly-4.png`);
  assert.equal(meta.imageWidth, 1200);
  assert.equal(meta.imageHeight, 630);
  assert.equal(meta.imageType, "image/png");
});

test("Twitter site handle is emitted only when it is a valid account handle", () => {
  assert.equal(normalizeTwitterHandle("VentureDex"), "@VentureDex");
  assert.equal(normalizeTwitterHandle("@VentureDex"), "@VentureDex");
  assert.equal(normalizeTwitterHandle("not a handle"), null);
  assert.equal(normalizeTwitterHandle("handle-that-is-too-long"), null);
  assert.equal(normalizeTwitterHandle(undefined), null);
});

test("Base layout emits complete social image metadata", () => {
  const source = readFileSync("src/layouts/Base.astro", "utf8");

  assert.match(source, /property="og:image:secure_url"/);
  assert.match(source, /property="og:image:type"/);
  assert.match(source, /name="twitter:image:alt"/);
  assert.match(source, /name="twitter:site"/);
  assert.match(source, /resolveSocialPreviewMeta/);
});

test("startup pages do not use screenshots as social preview cards", () => {
  const source = readFileSync("src/pages/startups/[slug].astro", "utf8");

  assert.doesNotMatch(source, /ogImage=\{screenshotUrl/);
  assert.doesNotMatch(source, /ogImageWidth=\{screenshotUrl \? 1440/);
  assert.doesNotMatch(source, /ogImageHeight=\{screenshotUrl \? 900/);
  assert.doesNotMatch(source, /ogImageType=\{screenshotUrl \? "image\/webp"/);
});
