// Reconcile two extracts: grid.diff (audit mode) does the comparison — this
// file wires two drop zones, a status column kept in step with it, five KPI
// tiles, a swap and an export. See README.md for the recipe and F-RECON-1
// (why "status" is a stamped field, not a computed column: a computed column
// reading grid.diff would itself be diffed against the fieldless snapshot).
const $ = (sel) => document.querySelector(sel);
const panel = (id, heading, html) => {
    const el = $('#' + id + '-body');
    el.className = 'panel';
    el.innerHTML = '<div class="panel__head">' + heading + '</div><div class="panel__body">' + (html || '') + '</div>';
    return el.lastChild;
};
LatticeGridLayout.createLayout($('#container'), {
    columns: 24, rows: 20, gap: 6, padding: 6, overflowX: 'static', overflowY: 'static',
    windows: [
        { id: 'load', title: 'Load two extracts', xPos: 1, yPos: 1, xSize: 24, ySize: 3, chrome: false },
        { id: 'table', title: 'Reconciliation', xPos: 1, yPos: 4, xSize: 17, ySize: 16, chrome: false },
        { id: 'kpis', title: 'Summary', xPos: 18, yPos: 4, xSize: 7, ySize: 16, chrome: false },
        { id: 'footer', title: 'Credits', xPos: 1, yPos: 20, xSize: 24, ySize: 1, chrome: false },
    ],
});
panel('load', 'Load two extracts &middot; ships with a seeded pair, or drop your own', $('#load-panel').innerHTML);
$('#footer-body').innerHTML = $('#footer-panel').innerHTML;
const money = { style: 'currency', currency: 'GBP' };
const grid = LatticeGrid.createGrid(panel('table', 'Reconciliation &middot; drop-shadow shows the prior value', ''), {
    rowKey: 'invoiceId', rows: [], filterRow: true, selection: 'multiple', diff: { removedRows: 'pinned' },
    columns: [
        { field: 'invoiceId', title: 'Invoice', layout: { width: 110 } },
        { field: 'supplier', title: 'Supplier', layout: { flex: 2, min: 160 } },
        { field: 'amount', title: 'Amount', type: 'number', format: money, total: 'sum' },
        { field: 'vatRate', title: 'VAT rate', type: 'number', format: { style: 'percent' } },
        { field: 'invoiceDate', title: 'Invoice date', type: 'date' },
        { field: 'status', title: 'Status', layout: { width: 110 }, filter: { type: 'set' },
            cell: { decoration: 'pill', variant: { map: { added: 'success', removed: 'danger', changed: 'warning', unchanged: 'neutral' } } } },
        { field: 'supplierBefore', title: 'Supplier (before)', layout: { hidden: true } },
        { field: 'amountBefore', title: 'Amount (before)', type: 'number', format: money, layout: { hidden: true } },
        { field: 'vatRateBefore', title: 'VAT rate (before)', type: 'number', format: { style: 'percent' }, layout: { hidden: true } },
    ],
});
$('#version').textContent = grid.getVersion();
// Re-stamp status/before fields from grid.diff onto every live row, then
// reload — called after loading either side and after a swap.
function sync() {
    const rows = grid.rows.data().map((r) => ({
        ...r,
        status: grid.diff.enabled ? grid.diff.statusOf(r.invoiceId, r) : 'unchanged',
        supplierBefore: grid.diff.enabled ? grid.diff.before(r.invoiceId, 'supplier') : undefined,
        amountBefore: grid.diff.enabled ? grid.diff.before(r.invoiceId, 'amount') : undefined,
        vatRateBefore: grid.diff.enabled ? grid.diff.before(r.invoiceId, 'vatRate') : undefined,
    }));
    grid.rows.load(rows);
    refreshStats();
}
function netAmountDelta() {
    let net = 0;
    grid.rows.forEachAll((row) => {
        if (!grid.diff.enabled || grid.diff.statusOf(row.key, row) !== 'changed') return;
        const before = grid.diff.before(row.key, 'amount');
        if (typeof before === 'number') net += row.data.amount - before;
    });
    return Math.round(net * 100) / 100;
}
const kpis = panel('kpis', 'Summary &middot; summary() + the engine', '<div class="tiles"></div>');
const tile = (id, title) => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = '<div class="tile-title">' + title + '</div><div class="tile-value" id="tile-' + id + '"></div>';
    kpis.firstChild.appendChild(el);
    return el.lastChild;
};
const stats = ['added', 'removed', 'changed', 'unchanged'].map((s) => LatticeGrid.createStat({
    grid, container: tile(s, s[0].toUpperCase() + s.slice(1)), value: (g) => g.diff.summary()[s], scope: 'all', live: false,
}));
stats.push(LatticeGrid.createStat({
    grid, container: tile('net', 'Net amount difference (changed rows)'), value: netAmountDelta, format: money, scope: 'all', live: false,
}));
const refreshStats = () => stats.forEach((s) => s.refresh());
// Before -> the diff snapshot, never applied as live rows. After -> the
// grid's own rows, replaced wholesale — both through import.preview.
async function loadBefore(text) {
    const preview = grid.import.preview(text);
    grid.diff.setSnapshot(preview.records);
    $('#before-status').textContent = preview.rowCount + ' rows loaded';
    sync();
}
async function loadAfter(text) {
    const preview = grid.import.preview(text);
    grid.import.apply(preview, { mode: 'replace' });
    $('#after-status').textContent = preview.rowCount + ' rows loaded';
    sync();
}
function wireDrop(zoneId, fileInputId, handler) {
    const zone = $('#' + zoneId), input = $('#' + fileInputId);
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
    ['dragover', 'dragleave', 'drop'].forEach((evt) => zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.toggle('over', evt === 'dragover');
        if (evt === 'drop' && e.dataTransfer.files[0]) e.dataTransfer.files[0].text().then(handler);
    }));
    input.addEventListener('change', () => { if (input.files[0]) input.files[0].text().then(handler); });
}
wireDrop('drop-before', 'file-before', loadBefore);
wireDrop('drop-after', 'file-after', loadAfter);
// Strip the stamped fields before swap, or they ride into the new snapshot
// and read back as a spurious change on every row once the sides trade places.
$('#swap-btn').addEventListener('click', () => {
    grid.rows.load(grid.rows.data().map(({ status, supplierBefore, amountBefore, vatRateBefore, ...rest }) => rest));
    if (!grid.diff.swap()) return;
    $('#swap-label').textContent = grid.diff.swapped
        ? 'Comparing Before against After (swapped)' : 'Comparing After against Before';
    sync();
});
let exceptionsOnly = false;
$('#exceptions-btn').addEventListener('click', () => {
    exceptionsOnly = !exceptionsOnly;
    grid.filters.set(exceptionsOnly ? { col: 'status', op: 'ne', value: 'unchanged', type: 'text' } : null);
    $('#exceptions-btn').textContent = exceptionsOnly ? 'Show all rows' : 'Only exceptions';
});
// Export always covers every exception, independent of the current filter —
// briefly including removed rows so they can be selected; processCell fills
// their status/before columns, since a removed row's before and current are
// the same snapshot record.
$('#export-btn').addEventListener('click', () => {
    const wasMode = grid.config().diff.removedRows;
    grid.set('diff', { ...grid.config().diff, removedRows: 'data' });
    const keys = grid.diff.removedKeys();
    grid.rows.forEachAll((row) => { if (row.data.status !== 'unchanged') keys.push(row.key); });
    grid.selection.set(keys);
    grid.export.csv({
        rows: 'selected', hidden: true, download: true, fileName: 'reconcile-exceptions.csv',
        columns: ['status', 'invoiceId', 'supplier', 'supplierBefore', 'amount', 'amountBefore', 'vatRate', 'vatRateBefore', 'invoiceDate'],
        processCell: (p) => {
            if (!p.row.removed) return p.text;
            const raw = { status: 'removed', supplierBefore: p.row.data.supplier, amountBefore: p.row.data.amount, vatRateBefore: p.row.data.vatRate }[p.colId];
            return raw === undefined ? p.text : String(p.column.formatValue ? p.column.formatValue(raw, p.row, p.row.data) : raw);
        },
    });
    grid.set('diff', { ...grid.config().diff, removedRows: wasMode });
    grid.selection.clear();
});
// The seeded pair, so the page works with no upload.
Promise.all(['data/invoices-after.csv', 'data/invoices-before.csv'].map((f) => fetch(f + '?v=' + window.STAMP).then((r) => r.text())))
    .then(([after, before]) => loadAfter(after).then(() => loadBefore(before)));
window.__demo = { grid, loadBefore, loadAfter, sync, netAmountDelta };
