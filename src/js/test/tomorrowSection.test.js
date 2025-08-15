import { showSummary } from '../ui/modal.js';

test('summary includes tomorrow section', () => {
  document.body.innerHTML = '<div id="overlay" style="display:none"><div id="modalContent"></div><div id="modalActions"></div></div>';
  const summary = {
    rows: [],
    meta: { day: 1, endNet: 0, startNet: 0, dNet: 0, dNetPct: 0, realized: 0, fees: 0, best:{sym:'A',priceCh:0}, worst:{sym:'B',priceCh:0}, interest:0 }
  };
  const tomorrow = [{ sym: 'AAA', title: 'Event A', mu: 0.001, sigma: 0.01, demand: 0.1 }];
  showSummary(summary, tomorrow, () => {});
  const txt = document.getElementById('modalContent').textContent;
  expect(txt).toContain("Tomorrow's Drivers");
  expect(txt).toContain('Event A');
});

console.log('tomorrowSection.test passed');

