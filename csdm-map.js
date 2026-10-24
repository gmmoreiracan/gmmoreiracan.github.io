(function () {
  'use strict';

  const DATA_URL = './books/mini-book-assets/csdm-map.json';
  const WIDTH = 2600;
  const HEIGHT = 1480;
  const NODE_W = 310;
  const NODE_H = 108;
  const NODE_GAP = 14;
  const LAYOUT_STORAGE_KEY = 'goodday:csdm-map:layout:v1';
  const SAFE_FIELDS = new Set([
    'active', 'assetType', 'availability', 'business_criticality', 'category', 'confidentiality',
    'correlation_id', 'data_flow_direction', 'description', 'display_name', 'environment',
    'governanceStatus', 'governed', 'install_status', 'integrity', 'interface_type',
    'authentication_type', 'authorization_type', 'life_cycle_stage', 'life_cycle_stage_status',
    'lifecyclePhase', 'message_format', 'name', 'number', 'operational_status', 'protocol',
    'reviewStatus', 'service_classification', 'short_description', 'state', 'subcategory', 'trigger', 'version'
  ]);
  const SAFE_RELATION_FIELDS = new Set([
    'active', 'availability', 'authentication_type', 'authorization_type', 'business_criticality',
    'confidentiality', 'data_flow_direction', 'description', 'display_name', 'environment',
    'install_status', 'integrity', 'interface_type', 'interval', 'message_format', 'name', 'number',
    'operational_status', 'order', 'protocol', 'service_classification', 'short_description', 'state', 'trigger', 'version'
  ]);
  const TYPE_STYLES = {
    application: { label: 'Business application', mark: '▣' },
    service: { label: 'Service', mark: '●' },
    capability: { label: 'Business capability', mark: '◆' },
    information: { label: 'Information object', mark: '▤' },
    api: { label: 'Application interface and integration', mark: '↔' },
    sdlc: { label: 'Software delivery component', mark: '⇢' },
    ai: { label: 'Artificial intelligence asset or deployment', mark: '✦' },
    infrastructure: { label: 'Infrastructure configuration item', mark: '⬡' }
  };
  const DOMAIN_COLORS = {
    foundation: '#74837b', ideation_strategy: '#b58a4e', design_planning: '#428491',
    build_integration: '#745cbc', service_delivery: '#e88a2e', service_consumption: '#39856d',
    manage_portfolio: '#a56f8b'
  };
  const DOMAIN_LAYOUT = {
    ideation_strategy: { x: 100, y: 170, w: 470, h: 170, anchor: { x: 335, y: 400 } },
    manage_portfolio: { x: 100, y: 430, w: 470, h: 170, anchor: { x: 335, y: 740 } },
    design_planning: { x: 640, y: 170, w: 470, h: 170, anchor: { x: 875, y: 400 } },
    foundation: { x: 640, y: 430, w: 470, h: 170, anchor: { x: 875, y: 740 } },
    build_integration: { x: 1180, y: 170, w: 620, h: 170, anchor: { x: 1490, y: 500 } },
    service_consumption: { x: 640, y: 790, w: 500, h: 170, anchor: { x: 890, y: 1110 } },
    service_delivery: { x: 1180, y: 790, w: 600, h: 170, anchor: { x: 1480, y: 1110 } }
  };
  const ZONES = [
    { label: 'BUSINESS & PORTFOLIO', hint: 'outcomes · capabilities · memberships', x: 100, y: 75, w: 470, domains: ['ideation_strategy', 'manage_portfolio'] },
    { label: 'DESIGN & INTEGRATION', hint: 'applications · interfaces · information', x: 640, y: 75, w: 470, domains: ['design_planning', 'foundation'] },
    { label: 'BUILD & DELIVERY', hint: 'components · application interfaces · documented artificial intelligence assets', x: 1180, y: 105, w: 620, domains: ['build_integration'] },
    { label: 'OPERATIONAL DELIVERY', hint: 'services · offerings · runtime CIs', x: 640, y: 695, w: 1140, domains: ['service_consumption', 'service_delivery'] }
  ];
  let cachedData = null;
  let loadingData = null;
  let state = null;
  let activeController = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }
  function asText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ');
    if (typeof value === 'object') return asText(value.displayValue != null ? value.displayValue : value.value);
    return String(value);
  }
  function normalizeList(value) { return Array.isArray(value) ? value : []; }
  function sysId(record) {
    const fromField = asText(record && record.fields && record.fields.sys_id);
    const id = String(record && record.id || '');
    return id ? id.slice(id.lastIndexOf(':') + 1) : fromField;
  }
  function recordLabel(record) {
    return asText(record && (record.name || (record.fields && (record.fields.name || record.fields.display_name)))) || 'Unnamed record';
  }
  function tableLabel(table) {
    const raw = String(table || '').trim();
    const aliases = { cmdb_rel_ci: 'CI relationship', cmdb_rel_asset_ci: 'Asset / CI relationship' };
    if (aliases[raw]) return aliases[raw];
    let label = raw.replace(/^cmdb_ci_/, '').replace(/^cmdb_ai_/, 'AI ')
      .replace(/^alm_ai_/, 'AI ').replace(/^sn_apm_di_/, '')
      .replace(/^cmn_/, '').replace(/^enterprise_/, 'Enterprise ')
      .replace(/^spm_/, 'Service portfolio ').replace(/^dpm_/, 'Portfolio ')
      .replace(/^cmdb_rel_/, 'CI relationship ').replace(/^dintf_/, 'interface ')
      .replace(/^api_/, 'API ').replace(/^ai_/, 'AI ')
      .replace(/[_-]+/g, ' ').trim();
    return label.replace(/\b(api|ai|mcp|http|oidc|sdlc|dvc|ci|m2m)\b/gi, function (word) {
      return word.toUpperCase();
    }).replace(/\b\w/g, function (character) { return character.toUpperCase(); });
  }
  function classify(record) {
    const table = String(record.className || record.table || '').toLowerCase();
    if (/alm_ai_|cmdb_model|cmdb_ci_appl_ai_application|cmdb_ci_function_mcp/.test(table)) return 'ai';
    if (/business_app|application_family/.test(table)) return 'application';
    if (/service_|service_offering/.test(table)) return 'service';
    if (/business_capability|business_process|value_stream|portfolio|taxonomy/.test(table)) return 'capability';
    if (/information_object/.test(table)) return 'information';
    if (/digital_integration|digital_interface|dintf|cmdb_ci_api/.test(table)) return 'api';
    if (/sdlc_component/.test(table)) return 'sdlc';
    return 'infrastructure';
  }
  function domainIds(record) { return normalizeList(record.metadata && record.metadata.csdmDomainIds); }
  function productIds(record) { return normalizeList(record.metadata && record.metadata.productDomainIds); }
  function displayDomain(record, data) {
    const tags = domainIds(record);
    const selected = tags.filter(function (id) { return state.domains.has(id); });
    if (selected.length) return selected[0];
    if (state.product !== 'all') {
      const product = data.productViews.find(function (item) { return item.id === state.product; });
      const productTags = normalizeList(product && product.csdmDomainIds);
      const matching = tags.filter(function (id) { return productTags.includes(id); });
      if (matching.length) return matching[0];
    }
    return tags[0] || 'foundation';
  }
  function readSavedPositions() {
    try {
      const value = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) { return {}; }
  }
  function savePositions(positions) {
    try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(positions || {})); } catch (_) {}
  }
  function makeState(restoreLayout) {
    return { product: 'all', domains: new Set(), context: false, labels: false, showAll: false,
      expanded: new Set(), selected: null, originId: null, upstreamLayers: 3, downstreamLayers: 3,
      relationshipLabels: new Set(), nodeTables: new Set(), relationshipTables: new Set(),
      search: '', searchLimit: 20, viewBox: null, hasDrawn: false,
      positions: restoreLayout ? readSavedPositions() : {} };
  }
  function loadData() {
    if (cachedData) return Promise.resolve(cachedData);
    if (!loadingData) {
      loadingData = fetch(new URL(DATA_URL, document.baseURI), { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('The static map snapshot could not be loaded (' + response.status + ').');
          return response.json();
        }).then(function (data) { cachedData = data; return data; })
        .catch(function (error) { loadingData = null; throw error; });
    }
    return loadingData;
  }
  function shellMarkup() {
    return '<div class="csdm-map-app" data-map-app>' +
      '<div class="map-heading-row"><div><p class="map-eyebrow">A STATIC COMMON SERVICE DATA MODEL SNAPSHOT · GOODDAY FAMILY CHORES</p><h3>Explore the relationships.</h3><p class="map-deck">Filter by product, service-model domain, relationship label, or table. Select a node as the origin to trace incoming and outgoing links up to three layers each; drag cards to arrange the diagram.</p></div><div class="map-heading-actions"><a class="map-open-standalone" href="./service-map.html" target="_blank" rel="noopener">Open in its own page <span aria-hidden="true">↗</span></a><span class="map-snapshot-pill" data-map-snapshot>Snapshot</span></div></div>' +
      '<div class="map-toolbar"><label class="map-search"><span class="sr-only">Search map records and supporting details</span><span aria-hidden="true">⌕</span><input type="search" data-map-search placeholder="Search records and details" autocomplete="off" aria-controls="map-search-results"><button type="button" class="map-clear-search" data-map-clear aria-label="Clear map search" hidden>×</button></label><div class="map-search-results" data-map-search-results id="map-search-results" aria-live="polite"></div><div class="map-view-count" data-map-count role="status" aria-live="polite"></div><div class="map-toolbar-actions"><button class="map-filter-open" type="button" data-filter-open aria-expanded="false" aria-controls="map-filters">Filters</button><button type="button" class="map-action-button" data-expand-all aria-pressed="false">Expand all groups</button><button type="button" class="map-action-button" data-auto-layout title="Restore the automatic diagram layout">Auto arrange</button><button type="button" class="map-action-button map-reset" data-reset>Reset view</button></div></div>' +
      '<div class="map-layout"><button class="map-scrim" data-map-scrim aria-label="Close filters" hidden></button>' +
      '<aside class="map-filters" id="map-filters" data-map-filters aria-label="Map filters" aria-hidden="true" inert><div class="map-panel-head"><div><p class="map-eyebrow">TUNE THE VIEW</p><h4>Filters</h4></div><button type="button" class="map-panel-close" data-filter-close aria-label="Close map filters">×</button></div>' +
      '<label class="map-field-label" for="map-product">PRODUCT VIEW</label><select id="map-product" class="map-product-select" data-product><option value="all">All product views</option></select>' +
      '<fieldset class="map-domain-fieldset"><legend>SERVICE MODEL DOMAINS <span>(combine tags)</span></legend><div class="map-domain-options" data-domains></div><p class="map-filter-hint">Records can belong to more than one domain. Selecting domains uses any matching tag.</p></fieldset>' +
      '<fieldset class="map-neighborhood-fieldset"><legend>ORIGIN NEIGHBORHOOD</legend><p class="map-filter-hint">Select a node as the origin. Incoming links are upstream; outgoing links are downstream.</p><div class="map-depth-controls"><label>Upstream<input type="number" min="0" max="10" step="1" value="3" data-upstream-depth aria-label="Maximum upstream relationship layers"></label><label>Downstream<input type="number" min="0" max="10" step="1" value="3" data-downstream-depth aria-label="Maximum downstream relationship layers"></label></div><p class="map-origin-status" data-origin-status role="status">Origin: no node selected</p><button type="button" class="map-action-button map-clear-origin" data-origin-clear disabled>Clear origin</button></fieldset>' +
      '<details class="map-filter-list"><summary>RELATIONSHIP LABELS <span data-filter-count-for="relationship-labels">All labels</span></summary><p class="map-filter-hint">These filters narrow arrows. Choices follow product, domain, node table, and origin; this list ignores its own selection so labels can be combined.</p><label class="map-filter-search"><span class="sr-only">Find relationship labels</span><input type="search" data-option-search="relationship-labels" placeholder="Find a relationship label" autocomplete="off"></label><div class="map-filter-options" data-relationship-labels></div></details>' +
      '<details class="map-filter-list"><summary>NODE TABLES <span data-filter-count-for="node-tables">All tables</span></summary><p class="map-filter-hint">Choices follow product, domain, relationship, and origin filters. This list ignores its own selection.</p><label class="map-filter-search"><span class="sr-only">Find node tables</span><input type="search" data-option-search="node-tables" placeholder="Find a node table" autocomplete="off"></label><div class="map-filter-options" data-node-tables></div></details>' +
      '<details class="map-filter-list"><summary>RELATIONSHIP SOURCE TABLES <span data-filter-count-for="relationship-tables">All tables</span></summary><p class="map-filter-hint">These filters narrow arrows. Choices follow product, domain, node table, label, and origin; this list ignores its own selection.</p><label class="map-filter-search"><span class="sr-only">Find relationship source tables</span><input type="search" data-option-search="relationship-tables" placeholder="Find a relationship source table" autocomplete="off"></label><div class="map-filter-options" data-relationship-tables></div></details>' +
      '<label class="map-check-row"><input type="checkbox" data-context><span><strong>Show connected context</strong><small>Include directly connected records outside the selected filters.</small></span></label>' +
      '<label class="map-check-row"><input type="checkbox" data-labels><span><strong>Relationship labels</strong><small>Show labels and counts on directed edges.</small></span></label>' +
      '<div class="map-legend"><p class="map-field-label">NODE LEGEND</p><div class="map-legend-grid" data-legend></div><p class="map-legend-domain"><i></i> Service Delivery domain</p></div>' +
      '</aside><section class="map-stage" aria-label="Interactive architecture diagram"><div class="map-canvas-topline"><span><i class="map-live-dot"></i> SERVICE RELATIONSHIP MAP</span><span data-map-layer-hint>Collapsed overview · select a domain to expand</span></div><div class="map-viewport" data-map-viewport tabindex="0" role="group" aria-label="Interactive architecture map. Drag record boxes to move them, drag open space to pan, and use the controls to zoom and fit."><svg class="map-svg" data-map-svg role="group" aria-label="Goodday service architecture diagram"><defs><marker id="csdm-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs><g data-edges></g><g data-nodes></g></svg></div><div class="map-zoom-bar"><span class="map-gesture-desktop">Drag cards to move · drag space to pan · Shift + arrows to nudge</span><span class="map-gesture-mobile">Pan on empty space · pinch to zoom</span><div><button type="button" data-zoom-out aria-label="Zoom out">−</button><button type="button" data-zoom-in aria-label="Zoom in">+</button><button type="button" data-fit>Fit to view</button></div></div></section>' +
      '<aside class="map-details" data-map-details aria-label="Selected record details" aria-hidden="true" inert><div class="map-panel-head"><div><p class="map-eyebrow">INSPECTOR</p><h4>Details</h4></div><button type="button" class="map-panel-close" data-detail-close aria-label="Close details">×</button></div><div class="map-detail-content" data-detail-content><div class="map-detail-empty"><span aria-hidden="true">↗</span><strong>Select a record or relationship</strong><p>Choose a map node or directed edge to inspect its source and evidence.</p></div></div></aside>' +
      '</div>' +
      '<section class="map-coverage" aria-labelledby="map-coverage-title"><div class="map-coverage-heading"><p class="map-eyebrow">WHAT THIS SNAPSHOT DOES NOT SHOW</p><h4 id="map-coverage-title">Coverage stays visible.</h4><p>The map reflects the exported records. Missing evidence remains a gap, not an inferred status.</p></div><article><span>01 / DELIVERY</span><strong>No change requests or delivery artifacts</strong><p>No change request records, pipeline executions, build artifacts, software bills of materials, test runs, or immutable release digests are in this snapshot.</p></article><article><span>02 / TECHNOLOGY RISK</span><strong>No risk or debt assessments</strong><p>There are no technical-risk or technical-debt assessment records, so no scores are shown.</p></article><article><span>03 / ARTIFICIAL INTELLIGENCE GOVERNANCE</span><strong>Documented assets, incomplete inventory</strong><p>No confirmed artificial intelligence prompt or Model Context Protocol server asset is present. Prompt-related information objects and the Goodday Model Context Protocol configuration item are included. The last Ollama loaded-model check was empty.</p></article></section>' +
      '<p class="map-source-note" data-map-source></p></div>';
  }
  function mount(mountPoint) {
    if (!mountPoint) return;
    if (!state) state = makeState(true);
    mountPoint.innerHTML = shellMarkup();
    const root = mountPoint.querySelector('[data-map-app]');
    activeController = root;
    loadData().then(function (data) {
      if (activeController !== root || !root.isConnected) return;
      root._data = data;
      populateControls(root, data);
      root.querySelector('[data-map-search]').value = state.search;
      root.querySelector('[data-map-clear]').hidden = !state.search;
      bindEvents(root);
      draw(root, { fit: true, initial: true });
    }).catch(function (error) {
      const source = root.querySelector('[data-map-source]');
      source.className += ' map-source-error';
      source.textContent = error.message + ' The page uses only its checked-in JSON asset; no live ServiceNow request is made.';
    });
  }
  function filterSet(group) {
    if (group === 'relationship-labels') return state.relationshipLabels;
    if (group === 'node-tables') return state.nodeTables;
    return state.relationshipTables;
  }
  function filterOptionMarkup(group, value, label, count, technical) {
    const selected = filterSet(group).has(value) ? ' checked' : '';
    const searchText = (label + ' ' + value + ' ' + (technical || '')).toLowerCase();
    return '<label class="map-filter-choice" data-filter-option data-filter-group="' + escapeHtml(group) + '" data-search-text="' + escapeHtml(searchText) + '"><input type="checkbox" data-filter-group="' + escapeHtml(group) + '" value="' + escapeHtml(value) + '"' + selected + '><span><strong>' + escapeHtml(label) + '</strong>' + (technical ? '<small>' + escapeHtml(technical) + '</small>' : '') + '</span><small class="map-filter-choice-count">' + count + '</small></label>';
  }
  function updateFilterSummaries(root) {
    ['relationship-labels', 'node-tables', 'relationship-tables'].forEach(function (group) {
      const set = filterSet(group);
      const total = root._filterOptionCounts && root._filterOptionCounts[group] || 0;
      const label = set.size ? set.size + ' selected' : 'All ' + total;
      const summary = root.querySelector('[data-filter-count-for="' + group + '"]');
      if (summary) summary.textContent = label;
    });
  }
  function countFilterValues(items, getValue) {
    const counts = new Map();
    items.forEach(function (item) {
      const value = String(getValue(item) || '').trim();
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    });
    return counts;
  }
  function renderFilterOptions(root, group, counts) {
    const containers = {
      'relationship-labels': '[data-relationship-labels]',
      'node-tables': '[data-node-tables]',
      'relationship-tables': '[data-relationship-tables]'
    };
    const optionSearch = root.querySelector('[data-option-search="' + group + '"]');
    const container = root.querySelector(containers[group]);
    const focused = document.activeElement;
    const restoreFocus = focused && container.contains(focused) && focused.matches('input[type="checkbox"]')
      ? focused.value : null;
    const scrollTop = container.scrollTop;
    const selected = filterSet(group);
    selected.forEach(function (value) { if (!counts.has(value)) counts.set(value, 0); });
    const labelFor = group === 'relationship-labels' ? function (value) { return value; } : tableLabel;
    const entries = Array.from(counts.entries()).sort(function (a, b) {
      return labelFor(a[0]).localeCompare(labelFor(b[0]));
    });
    container.innerHTML = entries.length ? entries.map(function (entry) {
      const label = labelFor(entry[0]);
      return filterOptionMarkup(group, entry[0], label, entry[1], group === 'relationship-labels' ? '' : entry[0]);
    }).join('') : '<p class="map-filter-hint map-filter-empty">No options in this diagram view. Clear another filter to see more.</p>';
    const query = optionSearch ? optionSearch.value.trim().toLowerCase() : '';
    container.querySelectorAll('[data-filter-option]').forEach(function (option) {
      option.hidden = Boolean(query && !option.dataset.searchText.includes(query));
    });
    container.scrollTop = scrollTop;
    if (restoreFocus) {
      const replacement = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(function (input) {
        return input.value === restoreFocus;
      });
      if (replacement) replacement.focus({ preventScroll: true });
    }
    root._filterOptionCounts = root._filterOptionCounts || {};
    root._filterOptionCounts[group] = counts.size;
  }
  function updateDynamicFilterOptions(root, data, visible) {
    const labelView = state.relationshipLabels.size ? viewData(data, 'relationship-labels') : visible;
    const nodeTableView = state.nodeTables.size ? viewData(data, 'node-tables') : visible;
    const relationshipTableView = state.relationshipTables.size ? viewData(data, 'relationship-tables') : visible;
    renderFilterOptions(root, 'relationship-labels', countFilterValues(labelView.edges, function (edge) {
      return edge.label || 'Relationship';
    }));
    renderFilterOptions(root, 'node-tables', countFilterValues(nodeTableView.visibleNodes, function (record) {
      return record.className || record.table;
    }));
    renderFilterOptions(root, 'relationship-tables', countFilterValues(relationshipTableView.edges, function (edge) {
      return edge.sourceRecord && edge.sourceRecord.table;
    }));
    updateFilterSummaries(root);
  }
  function populateControls(root, data) {
    const productSelect = root.querySelector('[data-product]');
    productSelect.innerHTML = '<option value="all">All product views</option>' + data.productViews.map(function (view) {
      return '<option value="' + escapeHtml(view.id) + '">' + escapeHtml(view.label) + '</option>';
    }).join('');
    productSelect.value = state.product;
    root.querySelector('[data-domains]').innerHTML = data.csdmDomains.map(function (domain) {
      const count = data.records.filter(function (record) { return record.isGraphNode === true && domainIds(record).includes(domain.id); }).length;
      const checked = state.domains.has(domain.id) ? ' checked' : '';
      const color = DOMAIN_COLORS[domain.id] || '#74837b';
      return '<label class="map-domain-option" style="--domain-color:' + color + '"><input type="checkbox" value="' + escapeHtml(domain.id) + '"' + checked + '><span>' + escapeHtml(domain.label) + '</span><small>' + count + '</small></label>';
    }).join('');
    root._filterOptionCounts = { 'relationship-labels': 0, 'node-tables': 0, 'relationship-tables': 0 };
    root.querySelector('[data-upstream-depth]').value = state.upstreamLayers;
    root.querySelector('[data-downstream-depth]').value = state.downstreamLayers;
    updateFilterSummaries(root);
    root.querySelector('[data-context]').checked = state.context;
    root.querySelector('[data-labels]').checked = state.labels;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const filters = root.querySelector('[data-map-filters]');
    const details = root.querySelector('[data-map-details]');
    filters.setAttribute('aria-hidden', String(mobile));
    filters.inert = mobile;
    details.setAttribute('aria-hidden', String(mobile));
    details.inert = mobile;
    root.querySelector('[data-expand-all]').setAttribute('aria-pressed', String(state.showAll));
    root.querySelector('[data-expand-all]').textContent = state.showAll ? 'Collapse overview' : 'Expand all groups';
    root.querySelector('[data-map-snapshot]').textContent = 'Snapshot · ' + formatDate(data.export.generatedAt);
    root.querySelector('[data-map-source]').textContent = 'Static export generated ' + formatDate(data.export.generatedAt) + '. ' + data.export.counts.graphNodes + ' graph nodes, ' + data.export.counts.records + ' total records, and ' + data.export.counts.relationships + ' directed relationships. Supporting records remain searchable in the inspector.';
    root.querySelector('[data-legend]').innerHTML = Object.keys(TYPE_STYLES).map(function (type) {
      const style = TYPE_STYLES[type];
      return '<span class="map-legend-item kind-' + type + '"><i>' + style.mark + '</i>' + style.label + '</span>';
    }).join('');
    const operation = data.productViews.find(function (view) { return view.id === 'operations'; });
    root.querySelector('.map-legend-domain i').style.backgroundColor = operation ? operation.color : '#e88a2e';
  }
  function formatDate(value) {
    if (!value) return 'date not supplied';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date) + ' UTC';
  }
  function edgeMatches(edge, excludedFilterGroup) {
    const metadata = edge.metadata || {};
    if (state.product !== 'all' && !normalizeList(metadata.productDomainIds).includes(state.product)) return false;
    if (state.domains.size && !normalizeList(metadata.csdmDomainIds).some(function (domain) { return state.domains.has(domain); })) return false;
    const excludeLabels = excludedFilterGroup === 'relationship-labels' || excludedFilterGroup === 'relationship-filters';
    const excludeTables = excludedFilterGroup === 'relationship-tables' || excludedFilterGroup === 'relationship-filters';
    if (!excludeLabels && state.relationshipLabels.size && !state.relationshipLabels.has(String(edge.label || 'Relationship'))) return false;
    if (!excludeTables && state.relationshipTables.size && !state.relationshipTables.has(String(edge.sourceRecord && edge.sourceRecord.table || ''))) return false;
    return true;
  }
  function matchesRecord(record, excludedFilterGroup) {
    const metadata = record.metadata || {};
    if (state.product !== 'all' && !normalizeList(metadata.productDomainIds).includes(state.product)) return false;
    if (state.domains.size && !normalizeList(metadata.csdmDomainIds).some(function (domain) { return state.domains.has(domain); })) return false;
    const table = String(record.className || record.table || '');
    if (excludedFilterGroup !== 'node-tables' && state.nodeTables.size && !state.nodeTables.has(table)) return false;
    return true;
  }
  function graphDistances(originId, adjacency, limit) {
    const distances = new Map([[originId, 0]]);
    const queue = [originId];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      const depth = distances.get(current);
      if (depth >= limit) continue;
      (adjacency.get(current) || []).forEach(function (next) {
        if (distances.has(next)) return;
        distances.set(next, depth + 1);
        queue.push(next);
      });
    }
    return distances;
  }
  function viewData(data, excludedFilterGroup) {
    const graph = data.records.filter(function (record) { return record.isGraphNode === true; });
    const byId = new Map(data.records.map(function (record) { return [record.id, record]; }));
    const graphById = new Map(graph.map(function (record) { return [record.id, record]; }));
    const baseNodes = graph.filter(function (record) { return matchesRecord(record, excludedFilterGroup); });
    const baseIds = new Set(baseNodes.map(function (record) { return record.id; }));
    let strictIds = new Set(baseIds);
    let strictNodes = baseNodes;
    let strictEdges = data.relationships.filter(function (edge) {
      return edgeMatches(edge, excludedFilterGroup) && baseIds.has(edge.source) && baseIds.has(edge.target);
    });
    let upstreamDistances = null;
    let downstreamDistances = null;
    let contextUpstreamDistances = null;
    let contextDownstreamDistances = null;
    const originAvailable = Boolean(state.originId && strictIds.has(state.originId));
    if (originAvailable) {
      const incoming = new Map(), outgoing = new Map();
      const neighborhoodEdges = data.relationships.filter(function (edge) {
        return edgeMatches(edge, 'relationship-filters') && baseIds.has(edge.source) && baseIds.has(edge.target);
      });
      neighborhoodEdges.forEach(function (edge) {
        if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
        if (!incoming.has(edge.target)) incoming.set(edge.target, []);
        outgoing.get(edge.source).push(edge.target);
        incoming.get(edge.target).push(edge.source);
      });
      upstreamDistances = graphDistances(state.originId, incoming, state.upstreamLayers);
      downstreamDistances = graphDistances(state.originId, outgoing, state.downstreamLayers);
      const neighborhoodIds = new Set([state.originId]);
      upstreamDistances.forEach(function (_distance, id) { neighborhoodIds.add(id); });
      downstreamDistances.forEach(function (_distance, id) { neighborhoodIds.add(id); });
      strictIds = neighborhoodIds;
      strictNodes = strictNodes.filter(function (record) { return strictIds.has(record.id); });
      strictEdges = strictEdges.filter(function (edge) { return strictIds.has(edge.source) && strictIds.has(edge.target); });
    }
    const contextIds = new Set();
    if (state.context && strictIds.size) {
      if (originAvailable) {
        const incoming = new Map(), outgoing = new Map();
        const graphEdges = data.relationships.filter(function (edge) {
          return edgeMatches(edge, excludedFilterGroup) && graphById.has(edge.source) && graphById.has(edge.target);
        });
        graphEdges.forEach(function (edge) {
          if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
          if (!incoming.has(edge.target)) incoming.set(edge.target, []);
          outgoing.get(edge.source).push(edge.target);
          incoming.get(edge.target).push(edge.source);
        });
        contextUpstreamDistances = graphDistances(state.originId, incoming, state.upstreamLayers);
        contextDownstreamDistances = graphDistances(state.originId, outgoing, state.downstreamLayers);
        graphEdges.forEach(function (edge) {
          if (strictIds.has(edge.source) && !strictIds.has(edge.target) &&
              (contextUpstreamDistances.has(edge.target) || contextDownstreamDistances.has(edge.target))) contextIds.add(edge.target);
          if (strictIds.has(edge.target) && !strictIds.has(edge.source) &&
              (contextUpstreamDistances.has(edge.source) || contextDownstreamDistances.has(edge.source))) contextIds.add(edge.source);
        });
      } else {
        data.relationships.forEach(function (edge) {
          if (!edgeMatches(edge, excludedFilterGroup)) return;
          if (strictIds.has(edge.source) && graphById.has(edge.target) && !strictIds.has(edge.target)) contextIds.add(edge.target);
          if (strictIds.has(edge.target) && graphById.has(edge.source) && !strictIds.has(edge.source)) contextIds.add(edge.source);
        });
      }
    }
    const finalIds = new Set(strictIds);
    contextIds.forEach(function (id) { finalIds.add(id); });
    const visibleNodes = graph.filter(function (record) { return finalIds.has(record.id); });
    const contextEdges = state.context ? data.relationships.filter(function (edge) {
      return edgeMatches(edge, excludedFilterGroup) && finalIds.has(edge.source) && finalIds.has(edge.target) &&
        (contextIds.has(edge.source) || contextIds.has(edge.target)) && !strictEdges.includes(edge);
    }) : [];
    return { graph: graph, byId: byId, graphById: graphById, strictNodes: strictNodes,
      strictIds: strictIds, contextIds: contextIds, visibleNodes: visibleNodes,
      edges: strictEdges.concat(contextEdges), originAvailable: originAvailable,
      upstreamDistances: upstreamDistances, downstreamDistances: downstreamDistances,
      contextUpstreamDistances: contextUpstreamDistances, contextDownstreamDistances: contextDownstreamDistances };
  }
  function spiralPosition(domain, index, domainIndex) {
    const config = DOMAIN_LAYOUT[domain] || { anchor: { x: WIDTH / 2, y: HEIGHT / 2 } };
    const saved = state.positions['domain:' + domain];
    const anchor = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : config.anchor;
    const angle = index * 2.399963229728653 + domainIndex * .73;
    const radius = 82 * Math.sqrt(index);
    return { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius * .72 };
  }
  function neighborhoodLayout(data, visible) {
    const originId = state.originId;
    const center = { x: WIDTH / 2, y: HEIGHT / 2 };
    const positions = new Map([[originId, center]]);
    const groupedRows = new Map();
    function addToRow(side, depth, record) {
      const key = side + ':' + depth;
      if (!groupedRows.has(key)) groupedRows.set(key, { side: side, depth: depth, records: [] });
      groupedRows.get(key).records.push(record);
    }
    visible.visibleNodes.forEach(function (record) {
      if (record.id === originId) return;
      const upstream = (visible.upstreamDistances && visible.upstreamDistances.get(record.id)) ??
        (visible.contextUpstreamDistances && visible.contextUpstreamDistances.get(record.id));
      const downstream = (visible.downstreamDistances && visible.downstreamDistances.get(record.id)) ??
        (visible.contextDownstreamDistances && visible.contextDownstreamDistances.get(record.id));
      let side, depth;
      if (upstream != null && (downstream == null || upstream <= downstream)) {
        side = 'upstream'; depth = upstream;
      } else if (downstream != null) {
        side = 'downstream'; depth = downstream;
      } else {
        const contextEdge = visible.edges.find(function (edge) {
          return (edge.source === record.id && edge.target !== record.id) || (edge.target === record.id && edge.source !== record.id);
        });
        const neighborId = contextEdge && (contextEdge.source === record.id ? contextEdge.target : contextEdge.source);
        const neighborUpstream = neighborId && visible.upstreamDistances && visible.upstreamDistances.get(neighborId);
        const neighborDownstream = neighborId && visible.downstreamDistances && visible.downstreamDistances.get(neighborId);
        if (neighborUpstream != null && (neighborDownstream == null || neighborUpstream <= neighborDownstream)) {
          side = 'upstream'; depth = neighborUpstream + 1;
        } else {
          side = 'downstream'; depth = neighborDownstream == null ? 1 : neighborDownstream + 1;
        }
      }
      addToRow(side, Math.max(1, depth), record);
    });
    const rowGap = NODE_H + 116;
    const rows = [{ side: 'origin', depth: 0, y: center.y, label: 'ORIGIN · ' + recordLabel(visible.graphById.get(originId) || { name: 'Selected node' }), count: 1 }];
    groupedRows.forEach(function (row) {
      row.records.sort(function (a, b) {
        const domainOrder = displayDomain(a, data).localeCompare(displayDomain(b, data));
        return domainOrder || recordLabel(a).localeCompare(recordLabel(b));
      });
      const y = center.y + (row.side === 'upstream' ? -1 : 1) * row.depth * rowGap;
      const spacing = NODE_W + NODE_GAP;
      const firstX = center.x - ((row.records.length - 1) * spacing) / 2;
      row.records.forEach(function (record, index) {
        const saved = state.positions[record.id];
        positions.set(record.id, saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
          ? { x: saved.x, y: saved.y }
          : { x: firstX + index * spacing, y: y });
      });
      rows.push({ side: row.side, depth: row.depth, y: y,
        label: (row.side === 'upstream' ? 'UPSTREAM · ' : 'DOWNSTREAM · ') + row.depth,
        count: row.records.length });
    });
    rows.sort(function (a, b) { return a.y - b.y; });
    const items = Array.from(positions.entries()).map(function (entry) {
      return { x: entry[1].x, y: entry[1].y, id: entry[0] };
    });
    const left = Math.min.apply(null, items.map(function (item) { return item.x - NODE_W / 2; }));
    const top = Math.min.apply(null, items.map(function (item) { return item.y - NODE_H / 2; }));
    const right = Math.max.apply(null, items.map(function (item) { return item.x + NODE_W / 2; }));
    const bottom = Math.max.apply(null, items.map(function (item) { return item.y + NODE_H / 2; }));
    return { positions: positions, rows: rows, bounds: { x: left - 24, y: top - 45, w: right - left + 48, h: bottom - top + 75 } };
  }
  function resolveCollisions(vertices, pinnedId, iterations, allowGroupMove) {
    const items = Array.from(vertices.values());
    const rounds = iterations || 34;
    for (let pass = 0; pass < rounds; pass += 1) {
      let collisions = 0;
      for (let i = 0; i < items.length; i += 1) {
        const a = items[i], ap = a.position;
        for (let j = i + 1; j < items.length; j += 1) {
          const b = items[j], bp = b.position;
          const overlapX = (ap.w + bp.w) / 2 + 18 - Math.abs(bp.x - ap.x);
          const overlapY = (ap.h + bp.h) / 2 + 18 - Math.abs(bp.y - ap.y);
          if (overlapX <= 0 || overlapY <= 0) continue;
          collisions += 1;
          const moveX = overlapX < overlapY;
          let sign = moveX ? Math.sign(bp.x - ap.x) : Math.sign(bp.y - ap.y);
          if (!sign) sign = ((i + j) % 2 ? 1 : -1);
          const distance = (moveX ? overlapX : overlapY) + 2;
          const aPinned = a.id === pinnedId || a.kind === 'domainLabel' || (a.kind === 'domain' && !allowGroupMove);
          const bPinned = b.id === pinnedId || b.kind === 'domainLabel' || (b.kind === 'domain' && !allowGroupMove);
          const move = function (item, delta) {
            if (moveX) item.position.x += delta; else item.position.y += delta;
          };
          if (aPinned && bPinned) continue;
          if (aPinned) move(b, sign * distance);
          else if (bPinned) move(a, -sign * distance);
          else { move(a, -sign * distance / 2); move(b, sign * distance / 2); }
        }
      }
      if (!collisions) break;
    }
    items.forEach(function (item) {
      item.position.x = Math.max(item.position.w / 2 + 35, item.position.x);
      item.position.y = Math.max(item.position.h / 2 + 35, item.position.y);
    });
  }
  function computeLayout(data, visible) {
    const originLayout = visible.originAvailable ? neighborhoodLayout(data, visible) : null;
    const domainRecords = new Map();
    visible.visibleNodes.forEach(function (record) {
      const domain = displayDomain(record, data);
      if (!domainRecords.has(domain)) domainRecords.set(domain, []);
      domainRecords.get(domain).push(record);
    });
    domainRecords.forEach(function (records) { records.sort(function (a, b) { return recordLabel(a).localeCompare(recordLabel(b)); }); });
    const domainBoxes = new Map();
    const recordPositions = new Map();
    const vertexByRecord = new Map();
    const vertices = new Map();
    const domainIndex = new Map();
    Object.keys(DOMAIN_LAYOUT).forEach(function (domain, index) { domainIndex.set(domain, index); });
    domainRecords.forEach(function (records, domain) {
      const expanded = state.showAll || !!originLayout || state.expanded.has(domain);
      const config = DOMAIN_LAYOUT[domain] || { x: WIDTH / 2, y: HEIGHT / 2, w: 470, h: 154, anchor: { x: WIDTH / 2, y: HEIGHT / 2 } };
      const accent = DOMAIN_COLORS[domain] || '#74837b';
      const savedAnchor = state.positions['domain:' + domain];
      const anchor = savedAnchor && Number.isFinite(savedAnchor.x) && Number.isFinite(savedAnchor.y) ? savedAnchor : config.anchor;
      if (!expanded) {
        const saved = state.positions['domain:' + domain];
        const center = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
          ? { x: saved.x, y: saved.y }
          : { x: config.x + config.w / 2, y: config.y + config.h / 2 };
        const vertex = { id: 'domain:' + domain, kind: 'domain', domain: domain, records: records,
          accent: accent, position: { x: center.x, y: center.y, w: config.w, h: config.h } };
        vertices.set(vertex.id, vertex);
        domainBoxes.set(domain, { domain: domain, records: records, expanded: false, x: center.x - config.w / 2, y: center.y - config.h / 2, w: config.w, h: config.h, anchor: center });
        records.forEach(function (record) { vertexByRecord.set(record.id, vertex); });
        return;
      }
      const index = domainIndex.get(domain) || 0;
      records.forEach(function (record, recordIndex) {
        const saved = state.positions[record.id];
        const position = saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
          ? { x: saved.x, y: saved.y }
          : (originLayout ? originLayout.positions.get(record.id) : spiralPosition(domain, recordIndex, index));
        const vertex = { id: record.id, kind: 'record', record: record, domain: domain, accent: accent,
          position: { x: position.x, y: position.y, w: NODE_W, h: NODE_H } };
        vertices.set(vertex.id, vertex);
        vertexByRecord.set(record.id, vertex);
      });
      if (!originLayout) {
        vertices.set('domain-label:' + domain, { id: 'domain-label:' + domain, kind: 'domainLabel', domain: domain,
          position: { x: anchor.x, y: anchor.y - 128, w: 320, h: 44 } });
      }
      domainBoxes.set(domain, { domain: domain, records: records, expanded: true, anchor: anchor, x: 0, y: 0, w: 0, h: 0 });
    });
    if (!originLayout) resolveCollisions(vertices, null, 54);
    vertices.forEach(function (vertex) {
      if (vertex.record) recordPositions.set(vertex.record.id, vertex.position);
    });
    domainBoxes.forEach(function (box, domain) {
      if (box.expanded) return;
      const group = vertices.get('domain:' + domain);
      if (group) { box.x = group.position.x - group.position.w / 2; box.y = group.position.y - group.position.h / 2; box.anchor = group.position; }
    });
    domainBoxes.forEach(function (box, domain) {
      if (!box.expanded) return;
      const nodes = box.records.map(function (record) { return vertexByRecord.get(record.id); }).filter(Boolean);
      if (!nodes.length) return;
      const left = Math.min.apply(null, nodes.map(function (node) { return node.position.x - node.position.w / 2; }));
      const top = Math.min.apply(null, nodes.map(function (node) { return node.position.y - node.position.h / 2; }));
      const right = Math.max.apply(null, nodes.map(function (node) { return node.position.x + node.position.w / 2; }));
      const bottom = Math.max.apply(null, nodes.map(function (node) { return node.position.y + node.position.h / 2; }));
      box.x = left; box.y = top - 220; box.w = right - left; box.h = bottom - top + 220;
    });
    const edgeGroups = new Map();
    const internalCounts = new Map();
    visible.edges.forEach(function (edge) {
      const source = vertexByRecord.get(edge.source), target = vertexByRecord.get(edge.target);
      if (!source || !target) return;
      if (source.id === target.id) {
        internalCounts.set(source.id, (internalCounts.get(source.id) || 0) + 1);
        return;
      }
      const key = source.id + '>' + target.id;
      if (!edgeGroups.has(key)) edgeGroups.set(key, { id: 'route:' + key, source: source, target: target, relationships: [], aggregate: false });
      edgeGroups.get(key).relationships.push(edge);
    });
    edgeGroups.forEach(function (group) {
      const collapsed = group.source.kind === 'domain' || group.target.kind === 'domain';
      group.aggregate = collapsed || group.relationships.length > 1;
      if (!group.aggregate) group.id = 'edge:' + group.relationships[0].id;
    });
    const points = Array.from(vertices.values());
    const maxX = points.length ? Math.max(WIDTH, Math.max.apply(null, points.map(function (item) { return item.position.x + item.position.w / 2 + 120; }))) : WIDTH;
    const maxY = points.length ? Math.max(HEIGHT, Math.max.apply(null, points.map(function (item) { return item.position.y + item.position.h / 2 + 120; }))) : HEIGHT;
    return { width: maxX, height: maxY, domainBoxes: domainBoxes, domainRecords: domainRecords,
      vertices: vertices, vertexByRecord: vertexByRecord, recordPositions: recordPositions,
      edges: Array.from(edgeGroups.values()), internalCounts: internalCounts,
      neighborhoodBounds: originLayout && originLayout.bounds,
      neighborhoodRows: originLayout && originLayout.rows };
  }
  function nodeTypeClass(record) { return 'kind-' + classify(record); }
  function tspanText(value, max, maxLines) {
    let remaining = String(value || '').replace(/\s+/g, ' ').trim();
    const lines = [];
    const lineLimit = Math.max(1, maxLines || 2);
    while (remaining && lines.length < lineLimit) {
      let cut = Math.min(max, remaining.length);
      if (remaining.length > max) {
        const wordCut = remaining.lastIndexOf(' ', max);
        if (wordCut > Math.round(max * .55)) cut = wordCut;
      }
      lines.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trimStart();
    }
    if (remaining && lines.length) {
      const last = lines.length - 1;
      lines[last] = lines[last].slice(0, Math.max(1, max - 1)).trimEnd() + '…';
    }
    return lines.length ? lines : [''];
  }
  function renderTspans(lines, x, lineHeight) {
    return lines.map(function (line, index) {
      return '<tspan x="' + x + '"' + (index ? ' dy="' + lineHeight + '"' : '') + '>' + escapeHtml(line) + '</tspan>';
    }).join('');
  }
  function renderRecordNode(vertex) {
    const record = vertex.record;
    const position = vertex.position;
    const x = position.x - NODE_W / 2, y = position.y - NODE_H / 2;
    const style = TYPE_STYLES[classify(record)];
    const name = recordLabel(record);
    const lines = tspanText(name, 22, 4);
    const selected = state.selected && state.selected.kind === 'record' && state.selected.id === record.id;
    const context = activeController && activeController._visible && activeController._visible.contextIds.has(record.id);
    const searchable = state.search && name.toLowerCase().includes(state.search.toLowerCase());
    const selectedEdge = state.selected && state.selected.kind === 'edge'
      ? (state.selected.detail || (activeController && activeController._edgeSelections && activeController._edgeSelections.get(state.selected.id)))
      : null;
    const edgeEndpoint = selectedEdge && selectedEdge.relationships.some(function (edge) { return edge.source === record.id || edge.target === record.id; });
    const selectedNodeId = state.selected && state.selected.kind === 'record' ? state.selected.id : null;
    const nodeConnected = selectedNodeId && activeController && activeController._visible &&
      activeController._visible.edges.some(function (edge) {
        return (edge.source === selectedNodeId && edge.target === record.id) || (edge.target === selectedNodeId && edge.source === record.id);
      });
    const dimmed = selectedNodeId && record.id !== selectedNodeId && !nodeConnected;
    const metadata = record.metadata || {};
    const description = asText(record.fields && (record.fields.description || record.fields.short_description));
    const label = name + ', ' + style.label + ', ' + (record.className || record.table) + (description ? '. ' + description : '') + '. Drag to move; use Alt and arrow keys to nudge.';
    return '<g class="map-node ' + nodeTypeClass(record) + (selected ? ' is-selected' : '') + (nodeConnected ? ' is-connected' : '') + (edgeEndpoint ? ' is-edge-endpoint' : '') + (dimmed ? ' is-dimmed' : '') + (context ? ' is-context' : '') + (searchable ? ' is-search-match' : '') + '" data-node-id="' + escapeHtml(record.id) + '" data-move-id="' + escapeHtml(record.id) + '" data-draggable="true" tabindex="0" role="button" aria-keyshortcuts="Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight" aria-label="' + escapeHtml(label) + '" aria-pressed="' + String(!!selected) + '">' +
      '<title>' + escapeHtml(name + ' · ' + (record.className || record.table)) + '</title><rect class="map-node-card" x="' + x + '" y="' + y + '" width="' + NODE_W + '" height="' + NODE_H + '" rx="11"></rect><rect class="map-node-accent" x="' + (x + 1) + '" y="' + (y + 11) + '" width="4" height="' + (NODE_H - 22) + '" rx="2"></rect>' +
      '<circle class="map-node-mark-bg" cx="' + (x + 28) + '" cy="' + (y + 48) + '" r="14"></circle><text class="map-node-mark" x="' + (x + 28) + '" y="' + (y + 51) + '" text-anchor="middle">' + style.mark + '</text>' +
      '<text class="map-node-label" x="' + (x + 53) + '" y="' + (y + 24) + '">' + renderTspans(lines, x + 53, 17) + '</text>' +
      '<text class="map-node-class" x="' + (x + 53) + '" y="' + (y + 99) + '">' + escapeHtml(tspanText((record.className || record.table) + (metadata.evidenceStatus === 'documented_snapshot' ? ' · DOCUMENTED' : ''), 32, 1)[0]) + '</text></g>';
  }
  function renderDomainBox(domain, box, data, layout, visible) {
    const label = (data.csdmDomains.find(function (item) { return item.id === domain; }) || {}).label || domain;
    const accent = DOMAIN_COLORS[domain] || '#74837b';
    const strictCount = box.records.filter(function (record) { return visible.strictIds.has(record.id); }).length;
    const contextCount = box.records.length - strictCount;
    const internal = box.expanded
      ? visible.edges.filter(function (edge) {
        const source = visible.graphById.get(edge.source), target = visible.graphById.get(edge.target);
        return source && target && displayDomain(source, data) === domain && displayDomain(target, data) === domain;
      }).length
      : (box.records.length ? (layout.internalCounts.get(layout.vertexByRecord.get(box.records[0].id).id) || 0) : 0);
    const groupSelected = state.selected && state.selected.kind === 'domain' && state.selected.id === domain;
    const x = box.x, y = box.y, w = box.w, h = box.h;
    let markup = '<g class="map-domain-group' + (groupSelected ? ' is-selected' : '') + '" style="--domain-accent:' + accent + '">';
    if (!box.expanded) {
      const names = box.records.slice(0, 3).map(recordLabel);
      const shown = tspanText(names.join(' · ') || 'No records in the selected view', Math.max(28, Math.floor((w - 48) / 7.5)), 2);
      markup += '<g class="map-cluster-node" data-domain-toggle="' + escapeHtml(domain) + '" data-move-id="domain:' + escapeHtml(domain) + '" tabindex="0" role="button" aria-keyshortcuts="Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight" aria-expanded="false" aria-label="Drag to move or activate to expand ' + escapeHtml(label) + ', ' + strictCount + ' matching records and ' + internal + ' internal relationships">' +
        '<title>Activate to expand ' + escapeHtml(label) + '</title><rect class="map-cluster-card" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="15"></rect><rect class="map-cluster-band" x="' + x + '" y="' + y + '" width="7" height="' + h + '" rx="4"></rect>' +
        '<text class="map-cluster-title" x="' + (x + 24) + '" y="' + (y + 38) + '">' + escapeHtml(label) + '</text><text class="map-cluster-count" x="' + (x + w - 24) + '" y="' + (y + 37) + '" text-anchor="end">' + strictCount + ' MATCHING RECORDS' + (contextCount ? ' · ' + contextCount + ' CONTEXT' : '') + '</text>' +
        '<text class="map-cluster-examples" x="' + (x + 24) + '" y="' + (y + 75) + '">' + renderTspans(shown, x + 24, 18) + '</text><text class="map-cluster-meta" x="' + (x + 24) + '" y="' + (y + 124) + '">' + internal + ' internal links · Select to expand</text><text class="map-cluster-arrow" x="' + (x + w - 27) + '" y="' + (y + h - 21) + '" text-anchor="end">↗</text></g>';
    } else {
      const anchor = box.anchor || { x: x + w / 2, y: y + 220 };
      const headX = anchor.x - 160, headY = anchor.y - 150;
      markup += '<g class="map-domain-heading" data-domain-toggle="' + escapeHtml(domain) + '" tabindex="0" role="button" aria-expanded="true" aria-label="Collapse ' + escapeHtml(label) + '"><rect class="map-domain-pill" x="' + headX + '" y="' + headY + '" width="320" height="44" rx="22"></rect><circle class="map-domain-pill-dot" cx="' + (headX + 17) + '" cy="' + (headY + 22) + '" r="5"></circle><text class="map-domain-title" x="' + (headX + 31) + '" y="' + (headY + 27) + '">' + escapeHtml(label) + '</text><text class="map-domain-count" x="' + (headX + 305) + '" y="' + (headY + 27) + '" text-anchor="end">' + strictCount + ' · COLLAPSE −</text></g>';
      box.records.forEach(function (record) {
        const vertex = layout.vertexByRecord.get(record.id);
        if (vertex) markup += renderRecordNode(vertex);
      });
    }
    return markup + '</g>';
  }
  function edgeLabel(edgeGroup) {
    if (edgeGroup.aggregate && edgeGroup.relationships.length > 1) return edgeGroup.relationships.length + ' relationships';
    return edgeGroup.relationships[0].label || 'relationship';
  }
  function borderPoint(position, side) {
    if (side === 'left') return { x: position.x - position.w / 2, y: position.y };
    if (side === 'right') return { x: position.x + position.w / 2, y: position.y };
    if (side === 'top') return { x: position.x, y: position.y - position.h / 2 };
    return { x: position.x, y: position.y + position.h / 2 };
  }
  function outsidePoint(position, side, gap) {
    const distance = gap || 28;
    const edge = borderPoint(position, side);
    if (side === 'left') edge.x -= distance;
    else if (side === 'right') edge.x += distance;
    else if (side === 'top') edge.y -= distance;
    else edge.y += distance;
    return edge;
  }
  function simplifyPath(points) {
    const result = [];
    points.forEach(function (point) {
      const last = result[result.length - 1];
      if (last && Math.abs(last.x - point.x) < 1 && Math.abs(last.y - point.y) < 1) return;
      result.push(point);
      while (result.length >= 3) {
        const a = result[result.length - 3], b = result[result.length - 2], c = result[result.length - 1];
        if ((Math.abs(a.x - b.x) < 1 && Math.abs(b.x - c.x) < 1) || (Math.abs(a.y - b.y) < 1 && Math.abs(b.y - c.y) < 1)) result.splice(result.length - 2, 1);
        else break;
      }
    });
    return result;
  }
  function pathBlockCount(points, obstacles) {
    let count = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1], b = points[i];
      for (let j = 0; j < obstacles.length; j += 1) {
        const position = obstacles[j].position;
        const left = position.x - position.w / 2 - 10, right = position.x + position.w / 2 + 10;
        const top = position.y - position.h / 2 - 10, bottom = position.y + position.h / 2 + 10;
        if (Math.abs(a.y - b.y) < 1 && a.y > top && a.y < bottom && Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right)) count += 1;
        else if (Math.abs(a.x - b.x) < 1 && a.x > left && a.x < right && Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom)) count += 1;
      }
    }
    return count;
  }
  function pathCost(points) {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) length += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    return length + Math.max(0, points.length - 2) * 48;
  }
  function pathMidpoint(points) {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) length += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
    let remaining = length / 2;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1], b = points[i];
      const segment = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (remaining <= segment && segment) {
        const ratio = remaining / segment;
        return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
      }
      remaining -= segment;
    }
    return points[Math.floor(points.length / 2)];
  }
  function edgePath(edgeGroup, layout) {
    const source = edgeGroup.source, target = edgeGroup.target;
    const obstacleMinX = Math.min(source.position.x, target.position.x) - 140;
    const obstacleMaxX = Math.max(source.position.x, target.position.x) + 140;
    const obstacleMinY = Math.min(source.position.y, target.position.y) - 140;
    const obstacleMaxY = Math.max(source.position.y, target.position.y) + 140;
    const obstacles = Array.from(layout.vertices.values()).filter(function (vertex) {
      if (vertex.id === source.id || vertex.id === target.id) return false;
      const p = vertex.position;
      return p.x + p.w / 2 > obstacleMinX && p.x - p.w / 2 < obstacleMaxX && p.y + p.h / 2 > obstacleMinY && p.y - p.h / 2 < obstacleMaxY;
    });
    const dx = target.position.x - source.position.x, dy = target.position.y - source.position.y;
    const horizontalSource = dx >= 0 ? 'right' : 'left';
    const horizontalTarget = dx >= 0 ? 'left' : 'right';
    const verticalSource = dy >= 0 ? 'bottom' : 'top';
    const verticalTarget = dy >= 0 ? 'top' : 'bottom';
    const sourceSides = [horizontalSource, verticalSource];
    const targetSides = [horizontalTarget, verticalTarget];
    const candidates = [];
    sourceSides.forEach(function (sourceSide) {
      targetSides.forEach(function (targetSide) {
        const sourcePort = borderPoint(source.position, sourceSide);
        const sourceOutside = outsidePoint(source.position, sourceSide);
        const targetPort = borderPoint(target.position, targetSide);
        const targetOutside = outsidePoint(target.position, targetSide);
        candidates.push(simplifyPath([sourcePort, sourceOutside, { x: targetOutside.x, y: sourceOutside.y }, targetOutside, targetPort]));
        candidates.push(simplifyPath([sourcePort, sourceOutside, { x: sourceOutside.x, y: targetOutside.y }, targetOutside, targetPort]));
      });
    });
    const minY = Math.min(source.position.y, target.position.y), maxY = Math.max(source.position.y, target.position.y);
    const minX = Math.min(source.position.x, target.position.x), maxX = Math.max(source.position.x, target.position.x);
    const railsY = [minY - 38, maxY + 38, (minY + maxY) / 2 - 34, (minY + maxY) / 2 + 34];
    const railsX = [minX - 38, maxX + 38, (minX + maxX) / 2 - 34, (minX + maxX) / 2 + 34];
    sourceSides.forEach(function (sourceSide) {
      targetSides.forEach(function (targetSide) {
        const sourcePort = borderPoint(source.position, sourceSide), sourceOutside = outsidePoint(source.position, sourceSide);
        const targetPort = borderPoint(target.position, targetSide), targetOutside = outsidePoint(target.position, targetSide);
        railsY.forEach(function (y) { candidates.push(simplifyPath([sourcePort, sourceOutside, { x: sourceOutside.x, y: y }, { x: targetOutside.x, y: y }, targetOutside, targetPort])); });
        railsX.forEach(function (x) { candidates.push(simplifyPath([sourcePort, sourceOutside, { x: x, y: sourceOutside.y }, { x: x, y: targetOutside.y }, targetOutside, targetPort])); });
      });
    });
    let best = null, bestScore = Infinity;
    candidates.forEach(function (points) {
      const blocked = pathBlockCount(points, obstacles);
      const score = pathCost(points) + blocked * 100000;
      if (score < bestScore) { best = points; bestScore = score; }
    });
    best = best || [borderPoint(source.position, horizontalSource), outsidePoint(source.position, horizontalSource), outsidePoint(target.position, horizontalTarget), borderPoint(target.position, horizontalTarget)];
    let d = 'M ' + best[0].x + ' ' + best[0].y;
    for (let i = 1; i < best.length; i += 1) d += ' L ' + best[i].x + ' ' + best[i].y;
    const midpoint = pathMidpoint(best);
    return { d: d, x: midpoint.x, y: midpoint.y, points: best };
  }
  function renderEdge(edgeGroup, layout) {
    const path = edgePath(edgeGroup, layout);
    const rels = edgeGroup.relationships;
    const selected = state.selected && state.selected.kind === 'edge' && state.selected.id === edgeGroup.id;
    const selectedNode = state.selected && state.selected.kind === 'record' ? state.selected.id : null;
    const connected = selectedNode && rels.some(function (edge) { return edge.source === selectedNode || edge.target === selectedNode; });
    const dim = selectedNode && !connected;
    const context = rels.some(function (edge) { return !edgeMatches(edge); });
    const label = edgeLabel(edgeGroup);
    const showLabel = state.labels;
    const shortLabel = label.length > 34 ? label.slice(0, 33) + '…' : label;
    return '<g class="map-edge' + (selected ? ' is-selected' : '') + (connected ? ' is-connected' : '') + (dim ? ' is-dimmed' : '') + (context ? ' is-context' : '') + '" data-edge-id="' + escapeHtml(edgeGroup.id) + '" tabindex="0" role="button" aria-label="' + escapeHtml((recordLabel(edgeGroup.source.record || { name: (dataName(edgeGroup.source)) })) + ' ' + label + ' ' + dataName(edgeGroup.target)) + '"><title>' + escapeHtml(label) + '</title><path class="map-edge-hit" d="' + path.d + '"></path><path class="map-edge-line" d="' + path.d + '" marker-end="url(#csdm-arrow)"></path>' + (showLabel ? '<text class="map-edge-label" x="' + path.x + '" y="' + (path.y - 7) + '" text-anchor="middle">' + escapeHtml(shortLabel) + '</text>' : '') + '</g>';
  }
  function dataName(vertex) { return vertex.record ? recordLabel(vertex.record) : ((vertex.records && vertex.records.length) ? (vertex.records.length + ' records in ' + vertex.domain) : vertex.domain); }
  function drawSvg(root, data, visible, layout) {
    const svg = root.querySelector('[data-map-svg]');
    const edgesGroup = root.querySelector('[data-edges]');
    const nodesGroup = root.querySelector('[data-nodes]');
    root._layout = layout;
    root._visible = visible;
    root._edgeSelections = new Map();
    const boxes = Array.from(layout.domainBoxes.entries());
    let layerMarkup = '';
    if (layout.neighborhoodRows) {
      layout.neighborhoodRows.forEach(function (row) {
        const label = row.label + (row.side === 'origin' ? '' : ' · ' + row.count + ' ' + (row.count === 1 ? 'node' : 'nodes'));
        layerMarkup += '<g class="map-neighborhood-row' + (row.side === 'origin' ? ' is-origin' : '') + '"><path class="map-neighborhood-rule" d="M ' + layout.neighborhoodBounds.x + ' ' + (row.y + NODE_H / 2 + 24) + ' H ' + (layout.neighborhoodBounds.x + layout.neighborhoodBounds.w) + '"></path><text class="map-neighborhood-layer" x="' + (WIDTH / 2) + '" y="' + (row.y - NODE_H / 2 - 12) + '" text-anchor="middle">' + escapeHtml(label) + '</text></g>';
      });
    } else {
      ZONES.forEach(function (zone) {
        if (!zone.domains.some(function (domain) { return layout.domainBoxes.has(domain); })) return;
        layerMarkup += '<g class="map-zone"><path class="map-zone-rule" d="M ' + zone.x + ' ' + (zone.y + 12) + ' H ' + (zone.x + zone.w) + '"></path><text class="map-layer-label" x="' + zone.x + '" y="' + zone.y + '">' + escapeHtml(zone.label) + '</text><text class="map-layer-hint" x="' + zone.x + '" y="' + (zone.y + 30) + '">' + escapeHtml(zone.hint) + '</text></g>';
      });
    }
    let edgeMarkup = '';
    layout.edges.forEach(function (edgeGroup) {
      root._edgeSelections.set(edgeGroup.id, edgeGroup);
      edgeMarkup += renderEdge(edgeGroup, layout);
    });
    let nodeMarkup = layerMarkup;
    if (layout.neighborhoodRows) {
      layout.vertices.forEach(function (vertex) { if (vertex.record) nodeMarkup += renderRecordNode(vertex); });
    } else {
      boxes.forEach(function (entry) { nodeMarkup += renderDomainBox(entry[0], entry[1], data, layout, visible); });
    }
    if (!visible.visibleNodes.length) {
      nodeMarkup += '<text class="map-empty-text" x="' + (WIDTH / 2) + '" y="320" text-anchor="middle">No map nodes match these filters.</text><text class="map-empty-hint" x="' + (WIDTH / 2) + '" y="350" text-anchor="middle">Clear a domain filter or choose another product view.</text>';
    }
    edgesGroup.innerHTML = edgeMarkup;
    nodesGroup.innerHTML = nodeMarkup;
    const fullBox = { x: 0, y: 0, w: layout.width, h: layout.height };
    if (!state.viewBox || !state.hasDrawn) state.viewBox = fullBox;
    if (!state.viewBox) state.viewBox = fullBox;
    svg.setAttribute('viewBox', [state.viewBox.x, state.viewBox.y, state.viewBox.w, state.viewBox.h].join(' '));
    svg.setAttribute('width', layout.width);
    svg.setAttribute('height', layout.height);
    const origin = state.originId && data.records.find(function (record) { return record.id === state.originId; });
    svg.setAttribute('aria-label', layout.neighborhoodRows
      ? 'Relationship neighborhood around ' + recordLabel(origin || { name: 'selected node' }) + ' with ' + visible.strictNodes.length + ' matching graph nodes and ' + layout.edges.length + ' visible relationship groups.'
      : 'Goodday service map with ' + visible.strictNodes.length + ' matching graph nodes and ' + layout.edges.length + ' visible relationship groups.');
    state.hasDrawn = true;
  }
  function updateCounts(root, data, visible, layout) {
    const shown = visible.strictNodes.length;
    const contextCount = visible.contextIds.size;
    const edgeCount = visible.edges.length;
    const text = shown + ' of ' + data.export.counts.graphNodes + ' graph nodes · ' + edgeCount + ' directed relationships' + (contextCount ? ' · ' + contextCount + ' context nodes' : '') + ' · ' + (data.records.length - data.export.counts.graphNodes) + ' supporting records searchable';
    root.querySelector('[data-map-count]').textContent = text;
    const originRecord = state.originId && data.records.find(function (record) { return record.id === state.originId; });
    root.querySelector('[data-map-layer-hint]').textContent = layout.neighborhoodRows
      ? 'Neighborhood around ' + recordLabel(originRecord) + ' · ' + state.upstreamLayers + ' upstream / ' + state.downstreamLayers + ' downstream layers'
      : (state.originId && !visible.originAvailable ? 'Origin hidden by filters · choose another node or clear the origin' : (state.showAll ? 'All matching records expanded' : (state.expanded.size ? state.expanded.size + ' domain group' + (state.expanded.size === 1 ? '' : 's') + ' expanded' : 'Collapsed overview · select a domain to expand')));
    root.querySelector('[data-expand-all]').textContent = state.showAll ? 'Collapse overview' : 'Expand all groups';
    root.querySelector('[data-expand-all]').setAttribute('aria-pressed', String(state.showAll));
    const originStatus = root.querySelector('[data-origin-status]');
    originStatus.textContent = !originRecord ? 'Origin: select a node' : (visible.originAvailable
      ? 'Origin: ' + recordLabel(originRecord)
      : 'Origin hidden by the current filters: ' + recordLabel(originRecord));
    root.querySelector('[data-origin-clear]').disabled = !state.originId;
    root.querySelector('[data-upstream-depth]').value = state.upstreamLayers;
    root.querySelector('[data-downstream-depth]').value = state.downstreamLayers;
    updateFilterSummaries(root);
    const product = root.querySelector('[data-product]');
    if (product.value !== state.product) product.value = state.product;
    root.querySelector('[data-context]').checked = state.context;
    root.querySelector('[data-labels]').checked = state.labels;
    root.querySelector('[data-map-viewport]').style.cursor = state.selected ? 'grab' : 'grab';
  }
  function draw(root, options) {
    if (!root || !root._data) return;
    options = options || {};
    const data = root._data;
    const visible = viewData(data);
    updateDynamicFilterOptions(root, data, visible);
    const layout = computeLayout(data, visible);
    drawSvg(root, data, visible, layout);
    updateCounts(root, data, visible, layout);
    renderDetails(root, data, visible);
    renderSearchResults(root, data);
    if (options.fit) fitView(root, options.initial);
    if (options.focusDomain) focusDomain(root, options.focusDomain);
    if (options.focusRecord) focusRecord(root, options.focusRecord);
  }
  function fitView(root, initial) {
    if (!root || !root._layout) return;
    const layout = root._layout;
    if (layout.neighborhoodBounds) {
      fitBox(root, layout.neighborhoodBounds, 40);
      return;
    }
    const boxes = Array.from(layout.domainBoxes.values());
    if (initial && window.matchMedia('(max-width: 600px)').matches) {
      const firstEntry = Array.from(layout.domainBoxes.entries()).find(function (entry) { return entry[0] === 'ideation_strategy'; }) || Array.from(layout.domainBoxes.entries())[0];
      if (firstEntry) {
        const first = firstEntry[1];
        const zone = ZONES.find(function (item) { return item.domains.includes(firstEntry[0]); });
        const bounds = zone ? { x: Math.min(first.x, zone.x), y: zone.y - 18,
          w: Math.max(first.x + first.w, zone.x + Math.min(zone.w, 560)) - Math.min(first.x, zone.x),
          h: first.y + first.h - (zone.y - 18) } : first;
        fitBox(root, bounds, 30); return;
      }
    }
    if (boxes.length) {
      const activeDomains = new Set(Array.from(layout.domainBoxes.keys()));
      const activeZones = ZONES.filter(function (zone) { return zone.domains.some(function (domain) { return activeDomains.has(domain); }); });
      const x = Math.min.apply(null, boxes.map(function (box) { return box.x; }).concat(activeZones.map(function (zone) { return zone.x; })));
      const y = Math.min.apply(null, boxes.map(function (box) { return box.y; }).concat(activeZones.map(function (zone) { return zone.y - 18; })));
      const right = Math.max.apply(null, boxes.map(function (box) { return box.x + box.w; }).concat(activeZones.map(function (zone) { return zone.x + zone.w; })));
      const bottom = Math.max.apply(null, boxes.map(function (box) { return box.y + box.h; }).concat(activeZones.map(function (zone) { return zone.y + 38; })));
      fitBox(root, { x: x, y: y, w: right - x, h: bottom - y }, 35);
      return;
    }
    state.viewBox = { x: 0, y: 0, w: layout.width, h: layout.height };
    root.querySelector('[data-map-svg]').setAttribute('viewBox', [0, 0, layout.width, layout.height].join(' '));
  }
  function fitBox(root, box, padding) {
    if (!box) return;
    const viewport = root.querySelector('[data-map-viewport]').getBoundingClientRect();
    const aspect = Math.max(.1, viewport.width / Math.max(1, viewport.height));
    let w = box.w + padding * 2, h = box.h + padding * 2;
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    state.viewBox = { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w: w, h: h };
    root.querySelector('[data-map-svg]').setAttribute('viewBox', [state.viewBox.x, state.viewBox.y, w, h].join(' '));
  }
  function focusDomain(root, domain) {
    const box = root._layout && root._layout.domainBoxes.get(domain);
    if (box) {
      fitBox(root, box, 38);
      const viewportWidth = root.querySelector('[data-map-viewport]').getBoundingClientRect().width;
      const desiredScreenWidth = window.matchMedia('(max-width: 900px)').matches
        ? Math.min(250, viewportWidth * .65)
        : Math.min(300, viewportWidth * .32);
      const currentScreenWidth = NODE_W * viewportWidth / state.viewBox.w;
      zoom(root, Math.min(1, currentScreenWidth / desiredScreenWidth));
    }
  }
  function focusRecord(root, recordId) {
    const position = root._layout && root._layout.recordPositions.get(recordId);
    if (position) fitBox(root, { x: position.x - 230, y: position.y - 100, w: 460, h: 200 }, 20);
    const node = Array.from(root.querySelectorAll('[data-node-id]')).find(function (item) { return item.dataset.nodeId === recordId; });
    if (node) node.focus({ preventScroll: true });
  }
  function svgPoint(svg, event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }
  function refreshEdgeGeometry(root, vertexId) {
    const layout = root._layout;
    layout.edges.forEach(function (edge) {
      if (edge.source.id !== vertexId && edge.target.id !== vertexId) return;
      const element = Array.from(root.querySelectorAll('[data-edge-id]')).find(function (item) { return item.dataset.edgeId === edge.id; });
      if (!element) return;
      const path = edgePath(edge, layout);
      element.querySelector('.map-edge-hit').setAttribute('d', path.d);
      element.querySelector('.map-edge-line').setAttribute('d', path.d);
      const label = element.querySelector('.map-edge-label');
      if (label) { label.setAttribute('x', path.x); label.setAttribute('y', path.y - 7); }
    });
  }
  function saveVisiblePositions(root) {
    root._layout.vertices.forEach(function (vertex) {
      if (vertex.record || vertex.kind === 'domain') state.positions[vertex.id] = { x: vertex.position.x, y: vertex.position.y };
    });
    root._layout.domainBoxes.forEach(function (box, domain) {
      if (box.expanded && box.anchor) state.positions['domain:' + domain] = { x: box.anchor.x, y: box.anchor.y };
    });
    savePositions(state.positions);
  }
  function moveMapItem(root, itemId, dx, dy) {
    const vertex = root._layout && root._layout.vertices.get(itemId);
    if (!vertex) return;
    vertex.position.x += dx; vertex.position.y += dy;
    resolveCollisions(root._layout.vertices, itemId, 48, vertex.kind === 'domain');
    saveVisiblePositions(root);
    if (vertex.record) { state.selected = { kind: 'record', id: itemId }; state.originId = itemId; }
    else if (vertex.domain) {
      const box = root._layout.domainBoxes.get(vertex.domain);
      if (box && box.expanded) box.anchor = vertex.position;
    }
    draw(root, vertex.record ? { focusRecord: itemId } : { fit: true });
  }
  function bindEvents(root) {
    const svg = root.querySelector('[data-map-svg]');
    const viewport = root.querySelector('[data-map-viewport]');
    root.querySelector('[data-product]').addEventListener('change', function (event) {
      state.product = event.target.value; state.expanded.clear(); state.showAll = false; state.selected = null; state.originId = null; state.viewBox = null; setDetails(root, false); draw(root, { fit: true });
    });
    root.querySelector('[data-domains]').addEventListener('change', function (event) {
      if (event.target.type !== 'checkbox') return;
      if (event.target.checked) state.domains.add(event.target.value); else state.domains.delete(event.target.value);
      state.expanded.clear(); state.showAll = false; state.selected = null; state.originId = null; state.viewBox = null; setDetails(root, false); draw(root, { fit: true });
    });
    root.querySelector('[data-map-filters]').addEventListener('change', function (event) {
      const group = event.target.dataset.filterGroup;
      if (!group || event.target.type !== 'checkbox') return;
      const values = filterSet(group);
      if (event.target.checked) values.add(event.target.value); else values.delete(event.target.value);
      if (state.selected && state.selected.kind === 'edge') state.selected = null;
      state.viewBox = null;
      draw(root, { fit: true });
    });
    root.querySelectorAll('[data-option-search]').forEach(function (input) {
      input.addEventListener('input', function () {
        const group = input.dataset.optionSearch;
        const query = input.value.trim().toLowerCase();
        root.querySelectorAll('[data-filter-option][data-filter-group="' + group + '"]').forEach(function (option) {
          option.hidden = query && !option.dataset.searchText.includes(query);
        });
      });
    });
    root.querySelector('[data-upstream-depth]').addEventListener('change', function (event) {
      const parsed = Number.parseInt(event.target.value, 10);
      state.upstreamLayers = Math.max(0, Math.min(10, Number.isFinite(parsed) ? parsed : 3));
      event.target.value = state.upstreamLayers;
      if (state.originId) { state.viewBox = null; draw(root, { fit: true }); }
    });
    root.querySelector('[data-downstream-depth]').addEventListener('change', function (event) {
      const parsed = Number.parseInt(event.target.value, 10);
      state.downstreamLayers = Math.max(0, Math.min(10, Number.isFinite(parsed) ? parsed : 3));
      event.target.value = state.downstreamLayers;
      if (state.originId) { state.viewBox = null; draw(root, { fit: true }); }
    });
    root.querySelector('[data-origin-clear]').addEventListener('click', function () {
      state.originId = null; state.selected = null; state.expanded.clear(); state.showAll = false; state.viewBox = null;
      setDetails(root, false); draw(root, { fit: true });
    });
    root.querySelector('[data-context]').addEventListener('change', function (event) { state.context = event.target.checked; draw(root, { fit: true }); });
    root.querySelector('[data-labels]').addEventListener('change', function (event) { state.labels = event.target.checked; draw(root); });
    root.querySelector('[data-expand-all]').addEventListener('click', function () {
      state.showAll = !state.showAll; state.expanded.clear(); state.selected = null; state.originId = null; state.viewBox = null; setDetails(root, false); draw(root, { fit: true });
    });
    root.querySelector('[data-auto-layout]').addEventListener('click', function () {
      state.positions = {};
      savePositions(state.positions);
      state.viewBox = null;
      draw(root, { fit: true });
    });
    root.querySelector('[data-reset]').addEventListener('click', function () {
      const positions = state.positions;
      state = makeState();
      state.positions = positions;
      setFilterDrawer(root, false);
      setDetails(root, false);
      populateControls(root, root._data);
      draw(root, { fit: true });
      root.querySelector('[data-map-search]').value = '';
      root.querySelector('[data-map-search]').focus();
    });
    root.querySelector('[data-map-svg]').addEventListener('click', function (event) {
      if (!root._suppressNextClick) return;
      root._suppressNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    root.querySelector('[data-fit]').addEventListener('click', function () { fitView(root); });
    root.querySelector('[data-zoom-in]').addEventListener('click', function () { zoom(root, .78); });
    root.querySelector('[data-zoom-out]').addEventListener('click', function () { zoom(root, 1.28); });
    root.querySelector('[data-filter-open]').addEventListener('click', function () { setFilterDrawer(root, true); });
    root.querySelector('[data-filter-close]').addEventListener('click', function () { setFilterDrawer(root, false); });
    root.querySelector('[data-map-scrim]').addEventListener('click', function () { setFilterDrawer(root, false); });
    root.querySelector('[data-detail-close]').addEventListener('click', function () { setDetails(root, false); });
    root.querySelector('[data-map-search]').addEventListener('input', function (event) {
      state.search = event.target.value.trim(); state.searchLimit = 20;
      root.querySelector('[data-map-clear]').hidden = !state.search;
      draw(root);
    });
    root.querySelector('[data-map-search]').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        const first = root.querySelector('[data-search-result]');
        if (first) { event.preventDefault(); first.click(); }
      }
      if (event.key === 'Escape') { event.target.value = ''; state.search = ''; root.querySelector('[data-map-clear]').hidden = true; draw(root); }
    });
    root.querySelector('[data-map-clear]').addEventListener('click', function () {
      state.search = ''; root.querySelector('[data-map-search]').value = ''; this.hidden = true; draw(root); root.querySelector('[data-map-search]').focus();
    });
    root.querySelector('[data-map-search-results]').addEventListener('click', function (event) {
      const result = event.target.closest('[data-search-result]');
      if (!result) {
        if (event.target.closest('[data-search-more]')) { state.searchLimit += 20; renderSearchResults(root, root._data); }
        return;
      }
      const record = root._data.records.find(function (item) { return item.id === result.dataset.searchResult; });
      if (!record) return;
      root.querySelector('[data-map-search-results]').classList.remove('is-open');
      if (record.isGraphNode) {
        state.showAll = false;
        const domain = displayDomain(record, root._data);
        state.expanded.add(domain);
        state.selected = { kind: 'record', id: record.id };
        state.originId = record.id;
        draw(root, { focusRecord: record.id });
        setDetails(root, true);
      } else {
        state.selected = { kind: 'record', id: record.id };
        draw(root);
        setDetails(root, true);
      }
    });
    root.querySelector('[data-detail-content]').addEventListener('click', function (event) {
      const button = event.target.closest('[data-inspect-edge]');
      if (!button) return;
      const relationship = root._data.relationships.find(function (item) { return item.id === button.dataset.inspectEdge; });
      if (!relationship) return;
      const edgeGroup = { id: 'edge:' + relationship.id, relationships: [relationship], aggregate: false,
        source: root._layout.vertexByRecord.get(relationship.source), target: root._layout.vertexByRecord.get(relationship.target) };
      state.selected = { kind: 'edge', id: edgeGroup.id, detail: edgeGroup };
      draw(root);
      setDetails(root, true);
    });
    svg.addEventListener('click', function (event) {
      const recordNode = event.target.closest('[data-node-id]');
      if (recordNode) {
        state.selected = { kind: 'record', id: recordNode.dataset.nodeId };
        state.originId = recordNode.dataset.nodeId;
        draw(root, { focusRecord: recordNode.dataset.nodeId });
        setDetails(root, true);
        return;
      }
      const edgeElement = event.target.closest('[data-edge-id]');
      if (edgeElement) {
        state.selected = { kind: 'edge', id: edgeElement.dataset.edgeId };
        draw(root);
        setDetails(root, true);
        return;
      }
      const domainToggle = event.target.closest('[data-domain-toggle]');
      if (domainToggle) toggleDomain(root, domainToggle.dataset.domainToggle);
    });
    svg.addEventListener('keydown', function (event) {
      const domainToggle = event.target.closest('[data-domain-toggle]');
      if (domainToggle && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleDomain(root, domainToggle.dataset.domainToggle); return; }
      const movable = event.target.closest('[data-move-id]');
      if (movable && (event.altKey || event.shiftKey) && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const distance = event.altKey ? 64 : 28;
        const delta = { ArrowRight: [distance, 0], ArrowLeft: [-distance, 0], ArrowDown: [0, distance], ArrowUp: [0, -distance] }[event.key];
        moveMapItem(root, movable.dataset.moveId, delta[0], delta[1]);
        return;
      }
      const node = event.target.closest('[data-node-id]');
      if (!node) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        state.selected = { kind: 'record', id: node.dataset.nodeId }; state.originId = node.dataset.nodeId; draw(root, { focusRecord: node.dataset.nodeId });
        setDetails(root, true);
      } else if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const next = keyboardNeighbor(root, node.dataset.nodeId, event.key);
        if (next) { event.preventDefault(); next.focus(); }
      }
    });
    root.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || event.target.matches('[data-map-search]')) return;
      if (root.querySelector('[data-map-filters]').classList.contains('is-open')) {
        event.preventDefault(); setFilterDrawer(root, false);
      } else if (root.querySelector('[data-map-details]').classList.contains('is-open')) {
        event.preventDefault(); setDetails(root, false);
      }
    });
    let pointer = null;
    const touchPoints = new Map();
    let pinch = null;
    function currentViewBox() {
      return Object.assign({}, state.viewBox || { x: 0, y: 0, w: WIDTH, h: root._layout.height });
    }
    function capturePointer(event) {
      try { viewport.setPointerCapture(event.pointerId); } catch (_) {}
    }
    function suppressGestureClick() {
      root._suppressNextClick = true;
      window.setTimeout(function () { root._suppressNextClick = false; }, 500);
    }
    function beginPinch() {
      const points = Array.from(touchPoints.entries()).slice(0, 2);
      if (points.length < 2) return;
      const a = points[0][1], b = points[1][1];
      const rect = viewport.getBoundingClientRect();
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const view = currentViewBox();
      pinch = {
        ids: [points[0][0], points[1][0]],
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        view: view,
        worldCenter: {
          x: view.x + (center.x - rect.left) / rect.width * view.w,
          y: view.y + (center.y - rect.top) / rect.height * view.h
        }
      };
      pointer = { mode: 'pinch' };
    }
    function updatePinch() {
      if (!pinch) return;
      const a = touchPoints.get(pinch.ids[0]), b = touchPoints.get(pinch.ids[1]);
      if (!a || !b) return;
      const rect = viewport.getBoundingClientRect();
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const minWidth = Math.max(120, root._layout.width * .035);
      const maxWidth = Math.max(minWidth * 2, root._layout.width * 1.8);
      const width = Math.max(minWidth, Math.min(maxWidth, pinch.view.w * pinch.distance / distance));
      const scale = width / pinch.view.w;
      const height = pinch.view.h * scale;
      state.viewBox = {
        x: pinch.worldCenter.x - (center.x - rect.left) / rect.width * width,
        y: pinch.worldCenter.y - (center.y - rect.top) / rect.height * height,
        w: width,
        h: height
      };
      svg.setAttribute('viewBox', [state.viewBox.x, state.viewBox.y, width, height].join(' '));
    }
    viewport.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'touch') {
        touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
        capturePointer(event);
        if (touchPoints.size >= 2) {
          if (pointer && pointer.mode === 'node') pointer.element.classList.remove('is-dragging');
          viewport.classList.remove('is-dragging-node');
          viewport.classList.add('is-panning');
          pointer = { mode: 'pinch' };
          beginPinch();
          suppressGestureClick();
          event.preventDefault();
          return;
        }
      }
      if (event.pointerType !== 'touch' && event.button !== 0) return;
      const movable = event.target.closest('[data-move-id]');
      if (movable) {
        const vertex = root._layout.vertices.get(movable.dataset.moveId);
        if (!vertex) return;
        const world = svgPoint(svg, event);
        pointer = { mode: 'node', id: event.pointerId, vertexId: vertex.id, vertex: vertex, element: movable,
          start: { x: vertex.position.x, y: vertex.position.y }, origin: world, moved: false };
        capturePointer(event);
        viewport.classList.add('is-dragging-node');
        event.preventDefault();
        return;
      }
      if (event.target.closest('[data-edge-id], [data-domain-toggle]')) return;
      pointer = { mode: 'pan', id: event.pointerId, x: event.clientX, y: event.clientY,
        view: currentViewBox() };
      capturePointer(event);
      viewport.classList.add('is-panning');
    });
    viewport.addEventListener('pointermove', function (event) {
      if (touchPoints.has(event.pointerId)) {
        touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch) {
          updatePinch();
          event.preventDefault();
          return;
        }
      }
      if (!pointer || pointer.id !== event.pointerId) return;
      if (pointer.mode === 'pinch') return;
      if (pointer.mode === 'node') {
        const current = svgPoint(svg, event);
        const dx = current.x - pointer.origin.x, dy = current.y - pointer.origin.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) pointer.moved = true;
        pointer.vertex.position.x = pointer.start.x + dx;
        pointer.vertex.position.y = pointer.start.y + dy;
        root._layout.recordPositions.set(pointer.vertexId, pointer.vertex.position);
        if (pointer.vertex.kind === 'domain') {
          const box = root._layout.domainBoxes.get(pointer.vertex.domain);
          if (box) {
            box.anchor = pointer.vertex.position;
            if (!box.expanded) { box.x = pointer.vertex.position.x - box.w / 2; box.y = pointer.vertex.position.y - box.h / 2; }
          }
        }
        pointer.element.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
        pointer.element.classList.add('is-dragging');
        refreshEdgeGeometry(root, pointer.vertexId);
        return;
      }
      const rect = viewport.getBoundingClientRect();
      state.viewBox = { x: pointer.view.x - (event.clientX - pointer.x) * pointer.view.w / rect.width,
        y: pointer.view.y - (event.clientY - pointer.y) * pointer.view.h / rect.height,
        w: pointer.view.w, h: pointer.view.h };
      svg.setAttribute('viewBox', [state.viewBox.x, state.viewBox.y, state.viewBox.w, state.viewBox.h].join(' '));
    });
    function endPan(event) {
      const wasTouch = touchPoints.has(event.pointerId);
      if (wasTouch) touchPoints.delete(event.pointerId);
      if (pinch && wasTouch) {
        const remaining = Array.from(touchPoints.entries());
        suppressGestureClick();
        if (remaining.length >= 2) {
          beginPinch();
          return;
        }
        pinch = null;
        if (remaining.length === 1) {
          pointer = { mode: 'pan', id: remaining[0][0], x: remaining[0][1].x, y: remaining[0][1].y,
            view: currentViewBox() };
          viewport.classList.remove('is-dragging-node');
          viewport.classList.add('is-panning');
          return;
        }
        pointer = null;
        viewport.classList.remove('is-panning', 'is-dragging-node');
        return;
      }
      if (!pointer || pointer.id !== event.pointerId) return;
      if (pointer.mode === 'pinch') return;
      if (pointer.mode === 'node') {
        const drag = pointer;
        drag.element.classList.remove('is-dragging');
        if (drag.moved) {
          resolveCollisions(root._layout.vertices, drag.vertexId, 48, drag.vertex.kind === 'domain');
          saveVisiblePositions(root);
          root._suppressNextClick = true;
          window.setTimeout(function () { root._suppressNextClick = false; }, 0);
          draw(root);
        } else if (event.type !== 'pointercancel' && drag.vertex.record) {
          root._suppressNextClick = true;
          window.setTimeout(function () { root._suppressNextClick = false; }, 0);
          state.selected = { kind: 'record', id: drag.vertexId };
          state.originId = drag.vertexId;
          draw(root, { focusRecord: drag.vertexId });
          setDetails(root, true);
        } else if (event.type !== 'pointercancel' && drag.vertex.domain) {
          root._suppressNextClick = true;
          window.setTimeout(function () { root._suppressNextClick = false; }, 0);
          toggleDomain(root, drag.vertex.domain);
        } else {
          draw(root);
        }
        pointer = null;
        viewport.classList.remove('is-dragging-node');
        return;
      }
      pointer = null; viewport.classList.remove('is-panning');
    }
    viewport.addEventListener('pointerup', endPan);
    viewport.addEventListener('pointercancel', endPan);
    viewport.addEventListener('wheel', function (event) {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = event.deltaY > 0 ? 1.12 : .89;
      const box = state.viewBox || { x: 0, y: 0, w: WIDTH, h: root._layout.height };
      const ratio = box.w * factor / box.w;
      const worldX = box.x + (event.clientX - rect.left) / rect.width * box.w;
      const worldY = box.y + (event.clientY - rect.top) / rect.height * box.h;
      state.viewBox = { x: worldX - (worldX - box.x) * ratio, y: worldY - (worldY - box.y) * ratio, w: box.w * factor, h: box.h * factor };
      svg.setAttribute('viewBox', [state.viewBox.x, state.viewBox.y, state.viewBox.w, state.viewBox.h].join(' '));
    }, { passive: false });
  }
  function toggleDomain(root, domain) {
    state.showAll = false;
    state.originId = null;
    if (state.expanded.has(domain)) state.expanded.delete(domain); else state.expanded.add(domain);
    state.selected = { kind: 'domain', id: domain };
    state.viewBox = null;
    draw(root, { focusDomain: state.expanded.has(domain) ? domain : null, fit: !state.expanded.has(domain) });
    setDetails(root, true);
  }
  function setDetails(root, open) {
    const panel = root.querySelector('[data-map-details]');
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', String(!open && mobile));
    panel.inert = !open && mobile;
    if (open && mobile) root.querySelector('[data-detail-close]').focus();
    if (!open && mobile) {
      const selectedId = state.selected && state.selected.kind === 'record' ? state.selected.id : null;
      const selectedNode = selectedId && Array.from(root.querySelectorAll('[data-node-id]')).find(function (node) { return node.dataset.nodeId === selectedId; });
      if (selectedNode) selectedNode.focus(); else root.querySelector('[data-map-viewport]').focus();
    }
  }
  function setFilterDrawer(root, open) {
    const panel = root.querySelector('[data-map-filters]');
    const scrim = root.querySelector('[data-map-scrim]');
    const button = root.querySelector('[data-filter-open]');
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', String(!open && window.matchMedia('(max-width: 900px)').matches));
    panel.inert = !open && window.matchMedia('(max-width: 900px)').matches;
    scrim.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) root.querySelector('[data-filter-close]').focus(); else button.focus();
  }
  function zoom(root, factor) {
    const box = state.viewBox || { x: 0, y: 0, w: WIDTH, h: root._layout.height };
    const centerX = box.x + box.w / 2, centerY = box.y + box.h / 2;
    state.viewBox = { x: centerX - box.w * factor / 2, y: centerY - box.h * factor / 2,
      w: box.w * factor, h: box.h * factor };
    root.querySelector('[data-map-svg]').setAttribute('viewBox', [state.viewBox.x, state.viewBox.y, state.viewBox.w, state.viewBox.h].join(' '));
  }
  function keyboardNeighbor(root, recordId, key) {
    const layout = root._layout;
    const start = layout.recordPositions.get(recordId);
    if (!start) return null;
    const vectors = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const vector = vectors[key];
    const candidates = Array.from(layout.recordPositions.entries()).filter(function (entry) { return entry[0] !== recordId; }).map(function (entry) {
      const dx = entry[1].x - start.x, dy = entry[1].y - start.y;
      const forward = dx * vector[0] + dy * vector[1];
      if (forward <= 0) return null;
      const side = Math.abs(dx * vector[1] - dy * vector[0]);
      return { id: entry[0], score: forward + side * 1.4 };
    }).filter(Boolean).sort(function (a, b) { return a.score - b.score; });
    if (!candidates.length) return null;
    return Array.from(root.querySelectorAll('[data-node-id]')).find(function (element) { return element.dataset.nodeId === candidates[0].id; }) || null;
  }
  function searchText(record) {
    const fields = record.fields || {};
    return [recordLabel(record), record.className, record.table, asText(fields.description), asText(fields.short_description), asText(fields.number)].join(' ').toLowerCase();
  }
  function renderSearchResults(root, data) {
    const panel = root.querySelector('[data-map-search-results]');
    const query = state.search.toLowerCase();
    if (query.length < 2) { panel.innerHTML = ''; panel.classList.remove('is-open'); return; }
    const matches = data.records.filter(function (record) { return searchText(record).includes(query); });
    if (!matches.length) { panel.innerHTML = '<p class="map-search-empty">No matching records or details.</p>'; panel.classList.add('is-open'); return; }
    const shown = matches.slice(0, state.searchLimit);
    let markup = '<ul role="listbox" aria-label="Map record search results">';
    shown.forEach(function (record) {
      const detail = record.isGraphNode ? 'MAP NODE' : 'DETAIL RECORD';
      markup += '<li><button type="button" role="option" data-search-result="' + escapeHtml(record.id) + '"><span><strong>' + escapeHtml(recordLabel(record)) + '</strong><small>' + escapeHtml(record.className || record.table) + ' · ' + detail + '</small></span><b aria-hidden="true">↗</b></button></li>';
    });
    markup += '</ul><p class="map-search-result-count">' + matches.length + ' matches' + (shown.length < matches.length ? ' · showing ' + shown.length : '') + '</p>';
    if (shown.length < matches.length) markup += '<button class="map-search-more" type="button" data-search-more>Show 20 more</button>';
    panel.innerHTML = markup;
    panel.classList.add('is-open');
  }
  function renderDetails(root, data, visible) {
    const content = root.querySelector('[data-detail-content]');
    const selected = state.selected;
    if (!selected) {
      content.innerHTML = '<div class="map-detail-empty"><span aria-hidden="true">↗</span><strong>Select a record or relationship</strong><p>Choose a map node or directed edge to inspect its source and evidence. Supporting records are available through search.</p></div>';
      return;
    }
    if (selected.kind === 'domain') {
      const boxRecords = visible.visibleNodes.filter(function (record) { return displayDomain(record, data) === selected.id; });
      const domain = data.csdmDomains.find(function (item) { return item.id === selected.id; });
      content.innerHTML = '<div class="map-detail-tag">SERVICE MODEL DOMAIN GROUP</div><h5>' + escapeHtml(domain ? domain.label : selected.id) + '</h5><p class="map-detail-description">' + escapeHtml(domain && domain.description || '') + '</p><dl class="map-detail-list"><div><dt>Matching graph nodes</dt><dd>' + boxRecords.filter(function (record) { return visible.strictIds.has(record.id); }).length + '</dd></div><div><dt>Supporting records</dt><dd>Searchable across the full snapshot</dd></div></dl><p class="map-detail-description">Records may carry additional service-model and product tags beyond this visual group.</p>';
      return;
    }
    if (selected.kind === 'edge') {
      const edgeGroup = selected.detail || root._edgeSelections.get(selected.id);
      if (edgeGroup) { content.innerHTML = relationshipDetails(edgeGroup, data); return; }
      content.innerHTML = '<div class="map-detail-empty"><strong>Relationship is outside the current view</strong><p>Expand the relevant domain groups or enable connected context to inspect its endpoints.</p></div>';
      return;
    }
    const record = data.records.find(function (item) { return item.id === selected.id; });
    if (!record) { content.innerHTML = ''; return; }
    content.innerHTML = recordDetails(record, data);
  }
  function tagNames(ids, entries) {
    return normalizeList(ids).map(function (id) {
      const entry = entries.find(function (item) { return item.id === id; });
      return entry ? entry.label : id;
    });
  }
  function safeFieldPairs(fields) {
    return Object.keys(fields || {}).filter(function (key) { return SAFE_FIELDS.has(key); }).map(function (key) {
      return [key.replace(/_/g, ' '), asText(fields[key])];
    }).filter(function (pair) { return pair[1]; });
  }
  function metaBlock(metadata, data) {
    const domains = tagNames(metadata.csdmDomainIds, data.csdmDomains);
    const products = tagNames(metadata.productDomainIds, data.productViews);
    const evidence = metadata.evidenceStatus ? '<div><dt>Evidence status</dt><dd>' + escapeHtml(metadata.evidenceStatus.replace(/_/g, ' ')) + '</dd></div>' : '';
    const updated = metadata.sourceUpdatedAt ? '<div><dt>Source updated</dt><dd>' + escapeHtml(metadata.sourceUpdatedAt) + '</dd></div>' : '';
    const source = metadata.sourceKind ? '<div><dt>Evidence source</dt><dd>' + escapeHtml(metadata.sourceKind.replace(/_/g, ' ')) + '</dd></div>' : '';
    return '<dl class="map-detail-list">' + evidence + source + updated + (domains.length ? '<div><dt>Service-model domains</dt><dd>' + escapeHtml(domains.join(' · ')) + '</dd></div>' : '') + (products.length ? '<div><dt>Product views</dt><dd>' + escapeHtml(products.join(' · ')) + '</dd></div>' : '') + '</dl>';
  }
  function fieldsMarkup(fields, heading) {
    const pairs = safeFieldPairs(fields);
    if (!pairs.length) return '';
    return '<section class="map-detail-section"><h6>' + escapeHtml(heading || 'Useful fields') + '</h6><dl class="map-detail-list">' + pairs.map(function (pair) {
      return '<div><dt>' + escapeHtml(pair[0]) + '</dt><dd>' + escapeHtml(pair[1]) + '</dd></div>';
    }).join('') + '</dl></section>';
  }
  function recordDetails(record, data) {
    const type = TYPE_STYLES[classify(record)];
    const title = recordLabel(record);
    const table = record.table || record.className || 'Record';
    const id = sysId(record);
    const description = asText(record.fields && (record.fields.description || record.fields.short_description));
    const isGraph = record.isGraphNode === true;
    let links = '';
    if (!isGraph) {
      const related = data.relationships.filter(function (edge) { return edge.sourceRecord && edge.sourceRecord.table === record.table && edge.sourceRecord.sysId === id; });
      if (related.length) links = '<section class="map-detail-section"><h6>Related map relationships</h6><ul class="map-related-list">' + related.slice(0, 8).map(function (edge) {
        const source = data.byId ? data.byId.get(edge.source) : data.records.find(function (item) { return item.id === edge.source; });
        const target = data.records.find(function (item) { return item.id === edge.target; });
        return '<li><button type="button" data-inspect-edge="' + escapeHtml(edge.id) + '"><strong>' + escapeHtml(edge.label || 'Relationship') + '</strong><small>' + escapeHtml(recordLabel(source || { name: edge.source })) + ' → ' + escapeHtml(recordLabel(target || { name: edge.target })) + '</small></button></li>';
      }).join('') + '</ul></section>';
    }
    return '<div class="map-detail-tag ' + (isGraph ? type && ('kind-' + classify(record)) : 'is-supporting') + '">' + (isGraph ? type.label.toUpperCase() : 'SUPPORTING / DETAIL RECORD') + '</div><h5>' + escapeHtml(title) + '</h5><p class="map-detail-class">' + escapeHtml(record.className || table) + (record.className && record.className !== table ? ' · ' + escapeHtml(table) : '') + '</p>' + (description ? '<p class="map-detail-description">' + escapeHtml(description) + '</p>' : '') +
      '<dl class="map-detail-list"><div><dt>Source sys_id</dt><dd class="map-monospace">' + escapeHtml(id) + '</dd></div><div><dt>Class / table</dt><dd>' + escapeHtml(table) + '</dd></div></dl>' +
      fieldsMarkup(record.fields, 'Safe fields') + metaBlock(record.metadata || {}, data) + links;
  }
  function safeRelationshipPairs(attributes) {
    return Object.keys(attributes || {}).filter(function (key) { return SAFE_RELATION_FIELDS.has(key); }).map(function (key) {
      return [key.replace(/_/g, ' '), asText(attributes[key])];
    }).filter(function (pair) { return pair[1]; });
  }
  function relationshipDetails(group, data) {
    const relationships = group.relationships || [];
    if (!relationships.length) return '';
    if (relationships.length > 1) {
      const sourceDomain = (data.csdmDomains.find(function (item) { return item.id === group.source.domain; }) || {}).label || group.source.domain;
      const targetDomain = (data.csdmDomains.find(function (item) { return item.id === group.target.domain; }) || {}).label || group.target.domain;
      const labels = Array.from(new Set(relationships.map(function (edge) { return edge.label; }).filter(Boolean)));
      const rows = relationships.slice(0, 14).map(function (edge) {
        const source = data.records.find(function (record) { return record.id === edge.source; });
        const target = data.records.find(function (record) { return record.id === edge.target; });
        const sourceName = recordLabel(source || { name: edge.source });
        const targetName = recordLabel(target || { name: edge.target });
        const sourceRecord = edge.sourceRecord || {};
        return '<li><button type="button" data-inspect-edge="' + escapeHtml(edge.id) + '"><strong>' + escapeHtml(edge.label || 'Relationship') + '</strong><small>' + escapeHtml(sourceName) + ' → ' + escapeHtml(targetName) + '</small><small>' + escapeHtml(sourceRecord.table || 'Source table not supplied') + ' · ' + escapeHtml(sourceRecord.sysId || 'sys_id not supplied') + '</small></button></li>';
      }).join('');
      return '<div class="map-detail-tag is-relationship">RELATIONSHIP GROUP</div><h5>' + relationships.length + ' directed relationships</h5><p class="map-detail-description">' + escapeHtml(dataName(group.source)) + ' → ' + escapeHtml(dataName(group.target)) + '</p><dl class="map-detail-list"><div><dt>Direction</dt><dd>Source to target, as recorded</dd></div><div><dt>Relationship labels</dt><dd>' + escapeHtml(labels.join(' · ') || 'Labels not supplied') + '</dd></div><div><dt>Source domain</dt><dd>' + escapeHtml(sourceDomain || '') + '</dd></div><div><dt>Target domain</dt><dd>' + escapeHtml(targetDomain || '') + '</dd></div></dl><section class="map-detail-section"><h6>Select a relationship to inspect attributes</h6><ul class="map-related-list">' + rows + '</ul></section>';
    }
    const edge = relationships[0];
    const source = data.records.find(function (record) { return record.id === edge.source; });
    const target = data.records.find(function (record) { return record.id === edge.target; });
    const attributes = safeRelationshipPairs(edge.attributes || {});
    const metadata = edge.metadata || {};
    return '<div class="map-detail-tag is-relationship">DIRECTED RELATIONSHIP</div><h5>' + escapeHtml(edge.label || 'Relationship') + '</h5><div class="map-endpoint"><small>SOURCE</small><strong>' + escapeHtml(recordLabel(source || { name: edge.source })) + '</strong><span>' + escapeHtml(source && (source.className || source.table) || '') + '</span></div><div class="map-endpoint map-endpoint-target"><small>TARGET</small><strong>' + escapeHtml(recordLabel(target || { name: edge.target })) + '</strong><span>' + escapeHtml(target && (target.className || target.table) || '') + '</span></div><dl class="map-detail-list"><div><dt>Source table</dt><dd>' + escapeHtml(edge.sourceRecord && edge.sourceRecord.table || 'Not supplied') + '</dd></div><div><dt>Source sys_id</dt><dd class="map-monospace">' + escapeHtml(edge.sourceRecord && edge.sourceRecord.sysId || 'Not supplied') + '</dd></div>' + (edge.relationshipType ? '<div><dt>Relationship type id</dt><dd class="map-monospace">' + escapeHtml(edge.relationshipType) + '</dd></div>' : '') + (metadata.evidenceStatus ? '<div><dt>Evidence status</dt><dd>' + escapeHtml(metadata.evidenceStatus.replace(/_/g, ' ')) + '</dd></div>' : '') + (metadata.sourceUpdatedAt ? '<div><dt>Source updated</dt><dd>' + escapeHtml(metadata.sourceUpdatedAt) + '</dd></div>' : '') + '</dl>' + (attributes.length ? '<section class="map-detail-section"><h6>Safe relationship attributes</h6><dl class="map-detail-list">' + attributes.map(function (pair) { return '<div><dt>' + escapeHtml(pair[0]) + '</dt><dd>' + escapeHtml(pair[1]) + '</dd></div>'; }).join('') + '</dl></section>' : '');
  }
  window.GooddayCSDMMap = { mount: mount };
  if (!document.getElementById('reader-body')) {
    const standaloneMount = document.querySelector('[data-csdm-map-mount]');
    if (standaloneMount) mount(standaloneMount);
  }
})();
