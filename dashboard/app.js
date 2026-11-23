// Token Radar's dashboard: a dark radar console, rendered from data.js.
//
// The page reads one global, window.TOKEN_RADAR, written by main.ts from the
// same board the gate checks. Nothing here fetches anything: no network, no
// imports, no links out. The board is sortable and filterable, each row opens
// a detail view that rebuilds the model's value from the snapshot's own
// fields and checks it against the board, and a second tab sets the ranked
// pre-token board beside the live-token protocols for contrast.
//
// The page answers to its hash, so a link can open one view directly:
// #p=<slug> opens that protocol's detail, #category=<name> filters the board.

'use strict';

/** The dashboard's data, or null when data.js did not load. */
var DATA = window.TOKEN_RADAR || null;

/** The page's state: which tab, what is typed, and how the table sorts. */
var state = {
  tab: 'pre',
  query: '',
  category: '',
  chain: '',
  sortKey: 'rank',
  sortDir: 1,
};

/** Escape text before it joins the page's HTML. */
function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A whole number with thousands separators. */
function fmtInt(value) {
  return Math.round(value).toLocaleString('en-US');
}

/** A dollar amount shortened the way the board shows it: $615.2M, $2.75B. */
function fmtUsd(value) {
  if (value >= 1e12) return '$' + trimNum(value / 1e12, 2) + 'T';
  if (value >= 1e9) return '$' + trimNum(value / 1e9, 2) + 'B';
  if (value >= 1e6) return '$' + trimNum(value / 1e6, 1) + 'M';
  if (value >= 1e3) return '$' + trimNum(value / 1e3, 1) + 'K';
  return '$' + fmtInt(value);
}

/** A number to a fixed precision with trailing zeroes trimmed. */
function trimNum(value, places) {
  var text = value.toFixed(places);
  while (text.indexOf('.') >= 0 && text.charAt(text.length - 1) === '0') {
    text = text.slice(0, -1);
  }
  if (text.charAt(text.length - 1) === '.') text = text.slice(0, -1);
  return text;
}

/** A signed seven-day change: +2.19%, -0.04%, or an em dash when unreported. */
function fmtGrowth(value) {
  if (value === null || value === undefined) return '\u2014';
  var sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return sign + Math.abs(value).toFixed(2) + '%';
}

/** The class a seven-day change takes: green, red, or none. */
function growthClass(value) {
  if (value === null || value === undefined || value === 0) return '';
  return value > 0 ? 'pos' : 'neg';
}

/** Whole days between two UTC dates, never below zero. */
function daysBetween(asOf, listedAt) {
  var span = Date.parse(asOf) - Date.parse(listedAt);
  return Math.max(0, Math.floor(span / 86400000));
}

/**
 * The model's value rebuilt from one row's own fields, in the same order the
 * model states it: TVL x 0.30, then the growth, age and chain multipliers.
 * A row with no listing date counts 180 days of age, as the model does.
 */
function recomputeImplied(row) {
  var growth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
  growth = Math.max(-60, Math.min(120, growth));
  var growthMult = 1 + (growth / 100) * 0.6;
  var age = row.listed_at === null || row.listed_at === undefined
    ? 180
    : daysBetween(DATA.as_of, row.listed_at);
  var ageMult = 0.5 + (Math.min(age, 1460) / 1460) * 0.5;
  var chains = row.chains ? row.chains.length : 1;
  var chainMult = 1 + 0.02 * Math.min(Math.max(chains - 1, 0), 5);
  return {
    value: Math.round(row.tvl_usd * 0.3 * growthMult * ageMult * chainMult),
    growthMult: growthMult,
    ageMult: ageMult,
    chainMult: chainMult,
    age: age,
    growth: growth,
  };
}

/** The rows the current tab holds: the ranked board, or the live-token set. */
function tabRows() {
  return state.tab === 'pre' ? DATA.rows : DATA.live;
}

/** The distinct categories and chains of the current tab, for the filters. */
function distinct(field) {
  var seen = {};
  var out = [];
  tabRows().forEach(function (row) {
    var values = field === 'chains' ? row.chains || [] : [row.category || 'Uncategorised'];
    values.forEach(function (value) {
      if (!seen[value]) {
        seen[value] = true;
        out.push(value);
      }
    });
  });
  out.sort();
  return out;
}

/** The rows after the search, category and chain filters. */
function visibleRows() {
  var query = state.query.trim().toLowerCase();
  return tabRows().filter(function (row) {
    if (query) {
      var hay = (row.name + ' ' + row.slug).toLowerCase();
      if (hay.indexOf(query) < 0) return false;
    }
    if (state.category && (row.category || 'Uncategorised') !== state.category) return false;
    if (state.chain && (!row.chains || row.chains.indexOf(state.chain) < 0)) return false;
    return true;
  });
}

/** The visible rows in the table's current sort order. */
function sortedRows() {
  var rows = visibleRows().slice();
  var key = state.sortKey;
  var dir = state.sortDir;
  function num(a, b) {
    return (a - b) * dir;
  }
  rows.sort(function (a, b) {
    if (key === 'rank') return num(a.rank || 0, b.rank || 0);
    if (key === 'name') return (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) * dir;
    if (key === 'tvl') return num(a.tvl_usd, b.tvl_usd);
    if (key === 'growth') {
      var ga = a.change_7d === null ? 0 : a.change_7d;
      var gb = b.change_7d === null ? 0 : b.change_7d;
      return num(ga, gb);
    }
    if (key === 'implied') return num(a.implied_value_usd || 0, b.implied_value_usd || 0);
    if (key === 'mcap') return num(a.mcap_usd || 0, b.mcap_usd || 0);
    return 0;
  });
  return rows;
}

/** One board row: rank, name, category, chains, TVL, 7-day change, value. */
function rowHtml(row, maxValue, position) {
  var value = state.tab === 'pre' ? row.implied_value_usd : row.mcap_usd;
  var width = maxValue > 0 ? Math.max(2, Math.round((value / maxValue) * 100)) : 0;
  var badge = row.watchlisted ? '<span class="badge">Watchlist</span>' : '';
  var status = state.tab === 'pre'
    ? '<span class="status">Pre-token</span>'
    : '<span class="status live">Live token</span>';
  return '<tr data-slug="' + esc(row.slug) + '">' +
    '<td class="num">' + (state.tab === 'pre' ? row.rank : position) + '</td>' +
    '<td><span class="name"><b>' + esc(row.name) + '</b>' +
    '<span class="sub">' + esc(row.slug) + '</span>' + badge + '</span></td>' +
    '<td>' + esc(row.category || 'Uncategorised') + '</td>' +
    '<td>' + esc((row.chains || []).join(', ')) + '</td>' +
    '<td class="num">' + fmtUsd(row.tvl_usd) + '</td>' +
    '<td class="num ' + growthClass(row.change_7d) + '">' + fmtGrowth(row.change_7d) + '</td>' +
    '<td><span class="implied"><span class="bar"><i style="width:' + width + '%"></i></span>' +
    '<span class="num">' + fmtUsd(value) + '</span></span>' +
    '<span class="sub">' + status + '</span></td>' +
    '</tr>';
}

/** The table head: every sortable column is a button that flips its order. */
function headHtml() {
  function th(label, key) {
    var arrow = state.sortKey === key ? (state.sortDir === 1 ? ' \u2191' : ' \u2193') : '';
    return '<th><button type="button" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }
  var valueLabel = state.tab === 'pre' ? 'Implied value' : 'Market cap';
  var valueKey = state.tab === 'pre' ? 'implied' : 'mcap';
  return '<thead><tr>' +
    th(state.tab === 'pre' ? 'Rank' : '#', 'rank') +
    th('Protocol', 'name') +
    '<th>Category</th><th>Chains</th>' +
    th('TVL', 'tvl') +
    th('7d', 'growth') +
    th(valueLabel, valueKey) +
    '</tr></thead>';
}

/** Rebuild the table body, the count and the sort arrows from the state. */
function renderTable() {
  var rows = sortedRows();
  var body = document.getElementById('board-body');
  var count = document.getElementById('row-count');
  var head = document.getElementById('board-head');
  if (!body || !count || !head) return;
  head.innerHTML = headHtml();
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty"><h2>Nothing on this radar</h2>' +
      '<p>No protocol matches the current search and filters.</p>' +
      '<button type="button" class="button primary" data-clear="1">Clear the filters</button></div></td></tr>';
    count.textContent = '0 rows';
    return;
  }
  var maxValue = 0;
  rows.forEach(function (row) {
    var value = state.tab === 'pre' ? row.implied_value_usd : row.mcap_usd;
    if (value > maxValue) maxValue = value;
  });
  var html = '';
  rows.forEach(function (row, index) {
    html += rowHtml(row, maxValue, index + 1);
  });
  body.innerHTML = html;
  var total = tabRows().length;
  count.textContent = rows.length + ' of ' + total + ' rows';
}

/** Rebuild the filter selects from the current tab's own values. */
function renderFilters() {
  var category = document.getElementById('filter-category');
  var chain = document.getElementById('filter-chain');
  if (category) {
    var options = '<option value="">All categories</option>';
    distinct('category').forEach(function (value) {
      options += '<option value="' + esc(value) + '"' +
        (state.category === value ? ' selected' : '') + '>' + esc(value) + '</option>';
    });
    category.innerHTML = options;
  }
  if (chain) {
    var chainOptions = '<option value="">All chains</option>';
    distinct('chains').forEach(function (value) {
      chainOptions += '<option value="' + esc(value) + '"' +
        (state.chain === value ? ' selected' : '') + '>' + esc(value) + '</option>';
    });
    chain.innerHTML = chainOptions;
  }
  var tabs = document.querySelectorAll('.tabs button');
  tabs.forEach(function (button) {
    button.setAttribute('aria-pressed', button.getAttribute('data-tab') === state.tab ? 'true' : 'false');
  });
}

/** The page's static shell: header, lede, controls, table, model and foot. */
function shellHtml() {
  var top = DATA.rows.length > 0 ? DATA.rows[0] : null;
  return '<div class="shell">' +
    '<header class="top"><div class="brand"><span class="mark"></span>' +
    '<span class="brand-name">Token Radar</span></div>' +
    '<div class="top-meta"><span>Snapshot ' + esc(DATA.as_of) + '</span>' +
    '<span>' + fmtInt(DATA.total_protocols) + ' protocols</span>' +
    '<span>' + DATA.watchlist_size + ' on the watchlist</span>' +
    '<span>' + DATA.rows.length + ' ranked</span></div></header>' +
    '<section class="lede"><div><h1>The next token, ranked before it exists</h1>' +
    '<p>Every protocol below records no token yet. The board ranks them by what ' +
    'a launch would be worth if the record stayed as it is: a share of the ' +
    'value locked, weighted by momentum, by the time run without a token, and ' +
    'by the chains it runs on. The live-token tab sets the comparison beside it.</p></div>' +
    '<div class="facts">' +
    '<div class="fact"><span>Top implied value</span><b>' + (top ? fmtUsd(top.implied_value_usd) : '\u2014') + '</b></div>' +
    '<div class="fact"><span>Top protocol</span><b>' + (top ? esc(top.name) : '\u2014') + '</b></div>' +
    '<div class="fact"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' of ' + DATA.watchlist_size + '</b></div>' +
    '<div class="fact"><span>Early radar rows</span><b>' + DATA.early_size + '</b></div>' +
    '<div class="fact"><span>Live tokens shown</span><b>' + DATA.live_size + '</b></div>' +
    '</div></section>' +
    '<section class="controls">' +
    '<div class="field"><label for="filter-search">Search</label>' +
    '<input id="filter-search" type="search" placeholder="Name or slug" value="' + esc(state.query) + '"></div>' +
    '<div class="field"><label for="filter-category">Category</label><select id="filter-category"></select></div>' +
    '<div class="field"><label for="filter-chain">Chain</label><select id="filter-chain"></select></div>' +
    '<div class="tabs" role="group" aria-label="Board tab">' +
    '<button type="button" data-tab="pre" aria-pressed="true">Pre-token</button>' +
    '<button type="button" data-tab="live" aria-pressed="false">Live token</button>' +
    '</div><span class="count" id="row-count"></span></section>' +
    '<section class="panel" id="board-panel"><div class="table-wrap"><table>' +
    '<thead id="board-head"></thead><tbody id="board-body"></tbody></table></div></section>' +
    '<section class="panel model"><h2>The model, in full</h2>' +
    '<p class="formula">implied = round(TVL \u00d7 0.30 \u00d7 (1 + clamp(change_7d, \u221260, 120) / 100 \u00d7 0.6) ' +
    '\u00d7 (0.5 + min(age_days, 1460) / 1460 \u00d7 0.5) \u00d7 (1 + 0.02 \u00d7 min(chains \u2212 1, 5)))</p>' +
    '<p class="formula">Age is the days since DefiLlama began tracking the protocol; a protocol ' +
    'with no listing date counts 180 days. A protocol records no token when both ' +
    'of its token fields are empty: the board never claims it has none.</p></section>' +
    '<p class="foot">Implied value is this radar\u2019s own claim from the sealed snapshot, never a ' +
    'promise that a token will launch or what it will trade at. Farm plans name ' +
    'real costs and real waits; check the protocol before sending funds.</p>' +
    '<dialog class="detail" id="detail"></dialog>' +
    '</div>';
}

/** Fill and open the detail view for one row. */
function openDetail(slug) {
  var row = null;
  var isLive = false;
  DATA.rows.forEach(function (candidate) {
    if (candidate.slug === slug) row = candidate;
  });
  if (!row) {
    DATA.live.forEach(function (candidate) {
      if (candidate.slug === slug) {
        row = candidate;
        isLive = true;
      }
    });
  }
  if (!row) return;
  var dialog = document.getElementById('detail');
  if (!dialog) return;
  var head = '<div class="detail-head"><div><h2>' + esc(row.name) + '</h2>' +
    '<p class="sub">' + esc(row.category || 'Uncategorised') + ' \u00b7 ' +
    esc((row.chains || []).join(', ')) + ' \u00b7 TVL ' + fmtUsd(row.tvl_usd) + '</p></div>' +
    '<button type="button" class="close" data-close="1">Close</button></div>';
  var body = '';
  if (isLive) {
    body = '<div class="detail-section"><h3>Already trading</h3>' +
      '<p>This protocol records a token, so it is not ranked. Its market cap is ' +
      fmtUsd(row.mcap_usd) + ' against ' + fmtUsd(row.tvl_usd) + ' locked. ' +
      'It is shown here so the ranked board can be read against the real thing.</p></div>';
  } else {
    var check = recomputeImplied(row);
    var match = check.value === row.implied_value_usd;
    var equation = '<div class="equation">' +
      '<div><span>TVL \u00d7 0.30</span><b>' + fmtUsd(row.tvl_usd * 0.3) + '</b></div>' +
      '<div><span>Growth \u00d7 ' + check.growthMult.toFixed(4) + ' (7d ' + fmtGrowth(row.change_7d) + ')</span><b>' + check.growth.toFixed(2) + '%</b></div>' +
      '<div><span>Age \u00d7 ' + check.ageMult.toFixed(4) + ' (' + check.age + ' days)</span><b>' + check.age + ' days</b></div>' +
      '<div><span>Chains \u00d7 ' + check.chainMult.toFixed(4) + ' (' + (row.chains || []).length + ' chains)</span><b>' + (row.chains || []).length + ' chains</b></div>' +
      '<div><span>Implied value</span><b>' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '<div><span>Recomputed from the snapshot</span><b>' + fmtUsd(check.value) + (match ? ' \u00b7 matches the board' : ' \u00b7 differs from the board') + '</b></div>' +
      '</div>';
    var steps = '<ol class="steps">';
    row.farm_steps.forEach(function (step, index) {
      steps += '<li><b>Step ' + (index + 1) + '</b>' + esc(step) + '</li>';
    });
    steps += '</ol><p class="cost">Capital ' + esc(row.farm_capital) + ' \u00b7 gas about ' +
      esc(row.farm_gas) + ' per transaction \u00b7 hold ' + row.farm_hold_days + ' days.</p>';
    body = '<div class="detail-section"><h3>How the value is built</h3>' + equation + '</div>' +
      '<div class="detail-section"><h3>Farm plan</h3>' + steps + '</div>';
  }
  dialog.innerHTML = head + body;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  try {
    history.replaceState(null, '', '#p=' + encodeURIComponent(slug));
  } catch (error) {
    // A page without history support keeps the dialog and drops the hash.
  }
}

/** Close the detail view and drop the protocol hash. */
function closeDetail() {
  var dialog = document.getElementById('detail');
  if (dialog && dialog.open) dialog.close();
  try {
    history.replaceState(null, '', state.category ? '#category=' + encodeURIComponent(state.category) : ' ');
  } catch (error) {
    // Nothing to restore when history is unavailable.
  }
}

/** Apply the page's hash: a protocol to open, or a category to filter by. */
function applyHash() {
  var hash = window.location.hash || '';
  var match = hash.match(/#p=([^&]+)/);
  if (match) {
    openDetail(decodeURIComponent(match[1]));
    return;
  }
  var category = hash.match(/#category=([^&]+)/);
  if (category) {
    state.category = decodeURIComponent(category[1]);
    var select = document.getElementById('filter-category');
    if (select) select.value = state.category;
    renderTable();
  }
}

/** Switch tabs, resetting the sort to the tab's own order. */
function switchTab(tab) {
  if (state.tab === tab) return;
  state.tab = tab;
  state.category = '';
  state.chain = '';
  state.sortKey = tab === 'pre' ? 'rank' : 'mcap';
  state.sortDir = tab === 'pre' ? 1 : -1;
  var search = document.getElementById('filter-search');
  if (search) search.value = state.query;
  renderFilters();
  renderTable();
}

/** Wire the page's controls once the shell is in place. */
function wireEvents() {
  var main = document.getElementById('board');
  if (!main) return;
  main.addEventListener('click', function (event) {
    var target = event.target;
    var sortButton = target.closest ? target.closest('[data-sort]') : null;
    if (sortButton) {
      var key = sortButton.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = -state.sortDir;
      } else {
        state.sortKey = key;
        state.sortDir = key === 'name' ? 1 : -1;
      }
      renderTable();
      return;
    }
    var tabButton = target.closest ? target.closest('[data-tab]') : null;
    if (tabButton) {
      switchTab(tabButton.getAttribute('data-tab'));
      return;
    }
    var clearButton = target.closest ? target.closest('[data-clear]') : null;
    if (clearButton) {
      state.query = '';
      state.category = '';
      state.chain = '';
      var search = document.getElementById('filter-search');
      if (search) search.value = '';
      renderFilters();
      renderTable();
      return;
    }
    var closeButton = target.closest ? target.closest('[data-close]') : null;
    if (closeButton) {
      closeDetail();
      return;
    }
    var row = target.closest ? target.closest('tbody tr[data-slug]') : null;
    if (row) openDetail(row.getAttribute('data-slug'));
  });
  var search = document.getElementById('filter-search');
  if (search) {
    search.addEventListener('input', function () {
      state.query = search.value;
      renderTable();
    });
  }
  var category = document.getElementById('filter-category');
  if (category) {
    category.addEventListener('change', function () {
      state.category = category.value;
      renderTable();
    });
  }
  var chain = document.getElementById('filter-chain');
  if (chain) {
    chain.addEventListener('change', function () {
      state.chain = chain.value;
      renderTable();
    });
  }
  var dialog = document.getElementById('detail');
  if (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeDetail();
    });
    dialog.addEventListener('close', function () {
      try {
        history.replaceState(null, '', state.category ? '#category=' + encodeURIComponent(state.category) : ' ');
      } catch (error) {
        // Nothing to restore when history is unavailable.
      }
    });
  }
}

/** Build the page, or say plainly when its data never arrived. */
function init() {
  var main = document.getElementById('board');
  if (!main) return;
  if (!DATA || !Array.isArray(DATA.rows)) {
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = '<div class="shell"><div class="empty"><h2>The radar has no data</h2>' +
      '<p>The board could not load its data file. Open the page beside data.js.</p></div></div>';
    return;
  }
  main.innerHTML = shellHtml();
  main.setAttribute('aria-busy', 'false');
  wireEvents();
  renderFilters();
  renderTable();
  applyHash();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
