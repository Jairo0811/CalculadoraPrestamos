import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  normalizePublisherId, adsTxtFor, canEnableAutoAds, configureHtml, applyAdsenseBuild
} from './configure-adsense.mjs';

const id = 'pub-1234567890123456'; // ID sintético usado exclusivamente en pruebas.
const html = '<!doctype html><html><head><title>Prueba</title></head><body><app-root></app-root></body></html>';

test('validates a real format and does not create fake IDs', () => {
  assert.equal(normalizePublisherId('ca-' + id), id);
  assert.equal(normalizePublisherId(''), '');
  assert.throws(() => normalizePublisherId('pub-not-valid'), /16 dígitos/);
  assert.equal(adsTxtFor(id), 'google.com, ' + id + ', DIRECT, f08c47fec0942fa0\n');
});

test('verification meta is visible in static HTML without loading advertising', () => {
  const output = configureHtml(html, id, false);
  assert.match(output, /name="google-adsense-account"/);
  assert.match(output, /content="ca-pub-1234567890123456"/);
  assert.doesNotMatch(output, /adsbygoogle\.js/);
  assert.equal(configureHtml(html, '', false), html);
});

test('auto ads are strictly gated, and previews stay ad-free', () => {
  assert.equal(canEnableAutoAds({}), false);
  assert.throws(() => canEnableAutoAds({ ADSENSE_AUTO_ADS_ENABLED: '1' }), /requiere/);
  const approved = {
    ADSENSE_AUTO_ADS_ENABLED: '1',
    ADSENSE_SITE_APPROVED: '1',
    ADSENSE_CMP_READY: '1',
    CF_PAGES: '1'
  };
  assert.equal(canEnableAutoAds({ ...approved, CF_PAGES_BRANCH: 'feature/test' }), false);
  assert.equal(canEnableAutoAds({ ...approved, CF_PAGES_BRANCH: 'master' }), true);
  assert.match(configureHtml(html, id, true), /adsbygoogle\.js/);
});

test('generates the ads.txt and verifies every prerendered page', () => {
  const root = mkdtempSync(join(tmpdir(), 'loancalc-adsense-'));
  try {
    mkdirSync(join(root, 'privacy'));
    writeFileSync(join(root, 'index.html'), html);
    writeFileSync(join(root, 'privacy', 'index.html'), html);
    const config = applyAdsenseBuild(root, { ADSENSE_PUBLISHER_ID: id });
    assert.deepEqual(config, { verificationConfigured: true, autoAdsEnabled: false, htmlPages: 2 });
    assert.equal(readFileSync(join(root, 'ads.txt'), 'utf8'), adsTxtFor(id));
    assert.match(readFileSync(join(root, 'privacy', 'index.html'), 'utf8'), /google-adsense-account/);
    assert.doesNotMatch(readFileSync(join(root, 'index.html'), 'utf8'), /adsbygoogle\.js/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('without ID: build remains ad-free and never produces ads.txt', () => {
  const root = mkdtempSync(join(tmpdir(), 'loancalc-no-ads-'));
  try {
    writeFileSync(join(root, 'index.html'), html);
    assert.deepEqual(applyAdsenseBuild(root, {}), {
      verificationConfigured: false, autoAdsEnabled: false, htmlPages: 1
    });
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), html);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
