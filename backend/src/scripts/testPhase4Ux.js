const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runPhase4UxTests() {
  console.log('--- Testing Phase 4: UI/UX Improvements & Accessibility ---');

  const appJsxPath = path.resolve(__dirname, '../../../frontend/src/App.jsx');
  const mainJsxPath = path.resolve(__dirname, '../../../frontend/src/main.jsx');
  const appContent = fs.readFileSync(appJsxPath, 'utf8');
  const mainContent = fs.readFileSync(mainJsxPath, 'utf8');

  // 1. UX-010: Safe Error Boundary
  assert.ok(
    !mainContent.includes('componentStack'),
    'main.jsx ErrorBoundary must NOT expose componentStack to end users (UX-010)'
  );
  assert.ok(
    mainContent.includes('Terjadi Kesalahan Sistem'),
    'main.jsx ErrorBoundary must render professional friendly error message'
  );
  assert.ok(
    mainContent.includes('Muat Ulang Halaman'),
    'main.jsx ErrorBoundary must provide a reload recovery button'
  );

  // 2. UX-014: Report Tab role alignment
  assert.ok(
    appContent.includes('{isL1 && (\n            <button \n              onClick={() => setCurrentTab(\'report\')}'),
    'App.jsx must wrap the report navigation button in isL1 check so L2 is not exposed to a 403 route (UX-014)'
  );

  // 3. UX-001: Keyboard ticket selection
  assert.ok(
    appContent.includes('role="button"'),
    'Ticket items must have role="button" for accessibility (UX-001)'
  );
  assert.ok(
    appContent.includes('tabIndex={0}'),
    'Ticket items must have tabIndex={0} for keyboard navigation (UX-001)'
  );
  assert.ok(
    appContent.includes('focus-visible:ring-2'),
    'Ticket items must provide visible focus indicators (UX-001)'
  );

  // 4. UX-003: Login Form Label Association
  assert.ok(
    appContent.includes('htmlFor="login-email"') && appContent.includes('id="login-email"'),
    'Login email input must have matching htmlFor and id (UX-003)'
  );
  assert.ok(
    appContent.includes('htmlFor="login-password"') && appContent.includes('id="login-password"'),
    'Login password input must have matching htmlFor and id (UX-003)'
  );

  // 5. UX-006: Filtered Empty State & Error Display
  assert.ok(
    appContent.includes('Tidak ada percakapan yang cocok dengan filter atau kata kunci.'),
    'App.jsx must render distinct message when filtered results are empty (UX-006)'
  );
  assert.ok(
    appContent.includes('Reset Filter & Pencarian'),
    'App.jsx must provide a Reset Filter action when filtered results are empty'
  );

  // 6. UX-007: Double-submit prevention
  assert.ok(
    appContent.includes('disabled={(!replyText.trim() && !selectedFile) || isSendingReply}'),
    'Public reply submit button must be disabled during active request (UX-007)'
  );
  assert.ok(
    appContent.includes('disabled={(!internalNoteText.trim() && !selectedInternalFile) || isSendingInternalNote}'),
    'Internal note submit button must be disabled during active request (UX-007)'
  );

  // 7. UX-005: Responsive Mobile/Desktop Panel Styling
  assert.ok(
    appContent.includes('w-full md:w-[320px] lg:w-[360px] xl:w-[380px] shrink-0'),
    'Queue panel must have responsive width (w-full on mobile, fixed on desktop) (UX-005)'
  );
  assert.ok(
    appContent.includes('title="Kembali ke Antrean"'),
    'Chat header must include mobile back button to return to queue (UX-005)'
  );

  console.log('✅ Phase 4 UI/UX: All frontend accessibility, responsiveness, and state assertions PASSED');
}

runPhase4UxTests().catch(err => {
  console.error('❌ Phase 4 UI/UX test failed:', err);
  process.exit(1);
});
