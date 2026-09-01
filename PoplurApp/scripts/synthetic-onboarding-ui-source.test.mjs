import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app/test-control.tsx', import.meta.url), 'utf8');
const proxy = await readFile(new URL('./test-control-proxy.mjs', import.meta.url), 'utf8');
const runner = await readFile(new URL('./synthetic-onboarding-runner.mjs', import.meta.url), 'utf8');

test('visible first-user signup uses the real welcome button listener without a decorative hit-target race', () => {
  assert.match(runner, /async function activateOnboardingControl\(locator, label\)/);
  assert.match(runner, /element\.scrollIntoView\(\{ block: 'center', inline: 'center' \}\);/);
  assert.match(runner, /element\.click\(\);/);
  assert.match(runner, /await sleep\(1_800\);\s+await capture\(page, 'welcome', 'welcome-visible'\);\s+await activateOnboardingControl\(prelogin\.locator\('#btnSignUp'\), 'Sign Up'\);/);
  assert.match(runner, /await activateOnboardingControl\(prelogin\.locator\('\.acctA'\), 'Personal account'\);/);
  assert.match(runner, /await activateOnboardingControl\(prelogin\.locator\('#paneSignUp \.paneBtn'\), 'Create account'\);/);
  assert.match(runner, /await activateOnboardingControl\(prelogin\.locator\('#paneCreateLogin \[data-signup-next\]'\), 'Create account details'\);/);
  assert.match(runner, /await activateOnboardingControl\(prelogin\.locator\('#paneProfilePhoto \[data-photo-continue\]'\), 'Continue with profile photo'\);/);
  assert.doesNotMatch(runner, /prelogin\.locator\('#btnSignUp'\)\.click\(\)/);
  assert.doesNotMatch(runner, /prelogin\.locator\('\.acctA'\)\.click\(\)/);
  assert.doesNotMatch(runner, /prelogin\.locator\('#paneSignUp \.paneBtn'\)\.click\(\)/);
});

test('completed first-user replay does not permanently disable five-actor mode', () => {
  assert.match(source, /const firstUserActive = firstUserMode\s*&& \(runnerState\?\.status === 'starting' \|\| runnerState\?\.status === 'live'\)/);
  assert.match(source, /disabled=\{commandBusy \|\| !runnerState \|\| firstUserActive\}/);
  assert.match(source, /replace the recorded first-user replay/);
  assert.doesNotMatch(source, /disabled=\{commandBusy \|\| !runnerState \|\| firstUserMode\} onValueChange/);
});

test('isolated forwarding drains production work while shared forwarding keeps realtime watchers live', () => {
  const start = proxy.indexOf('async function applyOnboardingCommand');
  const body = proxy.slice(start, proxy.indexOf('/**', start));
  const isolatedBranch = body.indexOf("const isolated = command.mode === 'first-user-v1'");
  const quarantine = body.indexOf('onboardingQuarantine = true');
  const teardown = body.indexOf('resetLiveWatchers()');
  const drain = body.indexOf('await drainProductionRequests()');
  const local = body.indexOf('await callLocalOnboardingCommand(command)');
  assert.ok(start >= 0 && isolatedBranch >= 0 && quarantine >= 0);
  assert.ok(quarantine < teardown && teardown < drain && drain < local);
  assert.match(body, /if \(isolated\) \{\s+onboardingQuarantine = true;\s+resetLiveWatchers\(\);\s+await drainProductionRequests\(\);\s+\}/);
  assert.match(body, /Shared[\s\S]*leaves the production realtime dashboard connected/);
  assert.match(body, /if \(isolated\) \{\s+onboardingQuarantine = false;\s+if \(liveClients\.size\) startLiveWatchers\(\);\s+\}/);
  assert.match(proxy, /productionRequests\.set\(controller, settled\)/);
  assert.match(proxy, /for \(const \[controller\] of pending\) controller\.abort\(\)/);
});

test('shared runner uses a bounded production query and canonical Map/radius Feed proof without Profile', () => {
  assert.match(runner, /url\.searchParams\.set\('syntheticOnboarding', mode\)/);
  assert.match(runner, /if \(mode === SHARED_ONBOARDING_MODE\) url\.searchParams\.set\('syntheticRunId', runId\)/);
  const sharedBranchStart = runner.indexOf('if (shared) {', runner.indexOf("await capture(page, 'posted'"));
  const sharedBranchEnd = runner.indexOf('\n    await waitForVisiblePost', sharedBranchStart);
  const sharedBranch = runner.slice(sharedBranchStart, sharedBranchEnd);
  assert.match(sharedBranch, /await waitForSharedPostProof\(page, 'map', policy\.state\.postId\)/);
  assert.match(sharedBranch, /if \(proof\.feedEligible\) \{[\s\S]*await waitForSharedPostProof\(page, 'feed', policy\.state\.postId\)/);
  assert.doesNotMatch(sharedBranch, /moveCubeTo\(clay, 'profile'\)|waitForVisiblePost\(clay, 'profile'/);
  assert.match(runner, /values\.mapId !== `pin:firestore:\$\{postId\}`/);
  assert.match(runner, /values\.feedId !== postId/);
});

test('shared verification reads only exact bound account, document and object paths', () => {
  const start = runner.indexOf('async function verifySharedOutcome');
  const end = runner.indexOf('\nexport function createSyntheticOnboardingRunner', start);
  const body = runner.slice(start, end);
  assert.match(body, /accounts:lookup\?key=/);
  assert.match(body, /\$\{firestoreBase\}\/users\/\$\{encodeURIComponent\(uid\)\}/);
  assert.match(body, /\$\{firestoreBase\}\/posts\/\$\{encodeURIComponent\(postId\)\}/);
  assert.match(body, /postLocations\/\$\{encodeURIComponent\(postId\)\}/);
  assert.match(body, /storageMetadata\(profilePhotoPath\)/);
  assert.match(body, /storageMetadata\(postStoragePath\)/);
  assert.doesNotMatch(body, /\.listUsers\s*\(|documents:runQuery|method:\s*['"]DELETE['"]|reset\w*\s*\(|cleanup\w*\s*\(/i);
});

test('Test Center truthfully separates emulator replay from the live shared tester', () => {
  assert.match(source, /Watch a separate real tester/);
  assert.match(source, /Both remain live on Poplur/);
  assert.match(source, /only when its normal radius qualifies, in Feed/);
  assert.match(source, /never injected into or checked against your personal Profile/);
  assert.match(source, /does not validate username-login reservation/);
  assert.match(source, /Create one production tester account and public post/);
  assert.match(source, /Map receives canonical public posts globally; Feed applies each post’s earned radius/);
  assert.match(source, /Profile remains strictly account-owned/);
  assert.doesNotMatch(source, /Map, Feed, Profile, Phone and House consume the same live post snapshot/);
});

test('dashboard bootstrap has no untracked unary Firestore read during quarantine', () => {
  const start = proxy.indexOf('async function ensurePublicSnapshot');
  const body = proxy.slice(start, proxy.indexOf('\nfunction broadcastLiveDashboard', start));
  assert.match(body, /publicSnapshotWaiters\.add\(waiter\)/);
  assert.match(body, /if \(liveState\.isPublicReady\(\)\) \{\s+publicSnapshotWaiters\.delete\(waiter\)/);
  assert.doesNotMatch(body, /\.get\s*\(/);
  assert.match(proxy, /waiter\.reject\(new Error\('Production snapshot wait was cancelled\.'\)\)/);
  assert.match(proxy, /function acceptPublicDocuments\(documents\) \{\s+if \(onboardingQuarantine\) return;/);
  assert.match(proxy, /if \(onboardingQuarantine\) return;\s+acceptPublicDocuments/);
});

test('camera-first follows the current direct version-to-map location handoff', () => {
  assert.match(runner, /getByRole\('button', \{ name: \/Use original\/i \}\)\.click\(\)/);
  assert.match(runner, /async function findVisibleRole\(page, role, options, timeoutMs = APP_TIMEOUT_MS\)/);
  assert.match(runner, /const spotButton = await findVisibleRole\(page, 'button', \{ name: \/Use this spot\.\*Attach the post here\/i \}\);/);
  assert.match(runner, /await spotButton\.click\(\);/);
  assert.doesNotMatch(runner, /clay\.getByRole\('button', \{ name: \/Use this spot\.\*Attach the post here\/i \}\)/);
  assert.doesNotMatch(runner, /LOCATION\.\*Choose a map spot/);
  assert.ok(
    runner.indexOf("await capture(page, 'composer', 'capture-ready')")
      < runner.indexOf("await capture(page, 'location', 'map-location-visible')"),
  );
  assert.match(runner, /await clay\.waitForFunction\(\(\) => \{\s+const location = window\.__poplurNativeLocation;/);
  assert.match(runner, /Number\(location\?\.latitude\) === 43\.6532/);
  assert.match(runner, /Number\(location\?\.longitude\) === -79\.3832/);
});

test('publish reports the visible upload error instead of hanging on Posted', () => {
  assert.match(runner, /const UPLOAD_OUTCOME_TIMEOUT_MS = 105_000;/);
  assert.match(runner, /const uploadOutcome = await Promise\.race\(\[/);
  assert.match(runner, /postedDialog\.waitFor\(\{ state: 'visible', timeout: UPLOAD_OUTCOME_TIMEOUT_MS \}\)/);
  assert.match(runner, /waitForScreen\(clay, 'map', UPLOAD_OUTCOME_TIMEOUT_MS\)/);
  assert.match(runner, /uploadAlert\.waitFor\(\{ state: 'visible', timeout: UPLOAD_OUTCOME_TIMEOUT_MS \}\)/);
  assert.match(runner, /throw new Error\(`Visible upload failed:/);
  assert.match(runner, /if \(uploadOutcome\.kind === 'posted'\) \{/);
  assert.doesNotMatch(runner, /getByRole\('dialog', \{ name: 'Posted' \}\)\.waitFor\(\{ state: 'visible', timeout: COMMAND_TIMEOUT_MS \}\)/);
});
