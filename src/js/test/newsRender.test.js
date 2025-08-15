import { renderAssetNewsTable } from '../ui/newsAssets.js';

test('asset news re-renders on selection', () => {
  document.body.innerHTML = '<div id="newsSymbol"></div><div id="newsTable"></div>';
  const ctx = {
    assets: [
      { sym: 'AAA', name: 'Alpha' },
      { sym: 'BBB', name: 'Beta' }
    ],
    selected: 'AAA',
    newsByAsset: {
      AAA: [{ when: 't', ev: { scope: 'asset', title: 'A', type: 'test', severity: 'minor', mu: 0, sigma: 0, demand: 0 } }],
      BBB: [{ when: 't', ev: { scope: 'asset', title: 'B', type: 'test', severity: 'minor', mu: 0, sigma: 0, demand: 0 } }]
    },
    state: { upgrades: {} }
  };
  renderAssetNewsTable(ctx);
  expect(document.getElementById('newsSymbol').textContent).toContain('AAA');
  ctx.selected = 'BBB';
  renderAssetNewsTable(ctx);
  expect(document.getElementById('newsSymbol').textContent).toContain('BBB');
});

console.log('newsRender.test passed');

