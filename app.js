(function () {
  'use strict';
  const BOOKS = {
    'field-account': { id: 'field-account', label: 'The book', shortLabel: 'THE BOOK', title: 'Building Goodday', subtitle: 'From a family app to a connected service', path: './books/goodday-book.md', source: 'Public manuscript' }
  };
  const data = {};
  let activeBookId = 'field-account', activeIndex = 0, activeView = 'read', figures = [], lightboxIndex = 0, toastTimer = 0;
  const el = function (id) { return document.getElementById(id); };
  const storage = {
    get: function (key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : value; } catch (_) { return fallback; } },
    set: function (key, value) { try { localStorage.setItem(key, value); } catch (_) {} },
    json: function (key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } }
  };
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }
  function slugify(value) {
    return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function parseInline(value) {
    let output = escapeHtml(value);
    output = output.replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>');
    output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_match, label, escapedUrl) {
      const href = escapedUrl.replace(/&amp;/g, '&').trim();
      if (/^https?:\/\//i.test(href)) return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      if (/^mailto:/i.test(href)) return '<a href="' + escapeHtml(href) + '">' + label + '</a>';
      if (/^#[a-zA-Z0-9_-]+$/.test(href)) return '<a href="' + escapeHtml(href) + '">' + label + '</a>';
      return label;
    });
    return output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  function safeAssetUrl(book, relativePath) {
    const clean = String(relativePath).replace(/&amp;/g, '&').trim();
    if (!clean.startsWith('./') || clean.includes('..')) return '';
    try { return new URL(clean.slice(2), new URL(book.path, document.baseURI)).href; } catch (_) { return ''; }
  }
  function splitTableCells(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (cell) { return cell.trim(); }); }
  function isTableRule(line) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line); }
  function isBlockStart(lines, index) {
    const line = lines[index] || '';
    return /^#{1,6}\s/.test(line) || /^>\s?/.test(line) || /^(\s*[-*]\s+|\s*\d+\.\s+)/.test(line) ||
      /^\s*---+\s*$/.test(line) || /^\x60\x60\x60/.test(line) ||
      (/^\s*\|/.test(line) && isTableRule(lines[index + 1] || '')) || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(line);
  }
  function renderMarkdown(markdown, book) {
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    const output = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
      if (imageMatch) {
        let caption = imageMatch[1];
        const captionMatch = (lines[index + 1] || '').trim().match(/^\*(.+)\*$/);
        if (captionMatch) { caption = captionMatch[1].trim(); index += 1; }
        const src = safeAssetUrl(book, imageMatch[2]);
        output.push(src ? '<figure class="book-figure"><img src="' + escapeHtml(src) + '" alt="' + escapeHtml(imageMatch[1]) + '" loading="lazy"><figcaption>' + parseInline(caption) + '</figcaption></figure>' : '<p class="image-unavailable">' + escapeHtml(imageMatch[1]) + '</p>');
        index += 1;
        continue;
      }
      const headingMatch = line.match(/^(#{3,6})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(4, headingMatch[1].length);
        output.push('<h' + level + ' id="h-' + slugify(book.id + '-' + headingMatch[2]) + '">' + parseInline(headingMatch[2]) + '</h' + level + '>');
        index += 1;
        continue;
      }
      if (/^\s*---+\s*$/.test(line)) { output.push('<hr>'); index += 1; continue; }
      if (/^\x60\x60\x60/.test(line)) {
        const codeLines = [];
        index += 1;
        while (index < lines.length && !/^\x60\x60\x60/.test(lines[index])) { codeLines.push(lines[index]); index += 1; }
        if (index < lines.length) index += 1;
        output.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        continue;
      }
      if (/^\s*\|/.test(line) && isTableRule(lines[index + 1] || '')) {
        const headers = splitTableCells(line);
        index += 2;
        const rows = [];
        while (index < lines.length && /^\s*\|/.test(lines[index])) { rows.push(splitTableCells(lines[index])); index += 1; }
        let table = '<div class="table-wrap"><table><thead><tr>';
        headers.forEach(function (cell) { table += '<th scope="col">' + parseInline(cell) + '</th>'; });
        table += '</tr></thead><tbody>';
        rows.forEach(function (row) {
          table += '<tr>';
          for (let i = 0; i < headers.length; i += 1) table += '<td>' + parseInline(row[i] || '') + '</td>';
          table += '</tr>';
        });
        output.push(table + '</tbody></table></div>');
        continue;
      }
      if (/^>\s?/.test(line)) {
        const quote = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) { quote.push(lines[index].replace(/^>\s?/, '')); index += 1; }
        output.push('<blockquote><p>' + parseInline(quote.join(' ')) + '</p></blockquote>');
        continue;
      }
      const listMatch = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
      if (listMatch) {
        const ordered = /^\d/.test(listMatch[1]), tag = ordered ? 'ol' : 'ul', items = [];
        while (index < lines.length) {
          const itemMatch = lines[index].match(/^\s*([-*]|\d+\.)\s+(.+)$/);
          if (!itemMatch || /^\d/.test(itemMatch[1]) !== ordered) break;
          items.push('<li>' + parseInline(itemMatch[2]) + '</li>');
          index += 1;
        }
        output.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
        continue;
      }
      const paragraph = [line.trim()];
      index += 1;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) { paragraph.push(lines[index].trim()); index += 1; }
      output.push('<p>' + parseInline(paragraph.join(' ')) + '</p>');
    }
    return output.join('\n');
  }
  function readPlainText(markdown) {
    return String(markdown || '').replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[\x60*_>#|]/g, ' ').replace(/^\s*[-+]\s+/gm, '').replace(/\s+/g, ' ').trim();
  }
  function classifySection(book, heading) {
    if (book.id === 'field-account') {
      if (/^Appendix [A-Z]\b/i.test(heading)) return 'Field guides & appendices';
      if (/^Sources(?: and further reading| and scope)?/i.test(heading)) return 'About this book';
      if (/^Closing$/i.test(heading)) return 'Closing';
      const chapter = Number((heading.match(/^(\d+)\b/) || [])[1] || 0);
      if (chapter >= 1 && chapter <= 6) return 'Part one · The application';
      if (chapter >= 7 && chapter <= 13) return 'Part two · ServiceNow in context';
      if (chapter >= 14 && chapter <= 30) return 'Part three · People and the agent';
      return 'Opening';
    }
    if (/^Chapter\b|^Opening$|^Closing$/i.test(heading)) return 'The journey';
    return 'The draft';
  }
  function parseBook(book, markdown) {
    const lines = markdown.replace(/\r/g, '').split('\n');
    const contentsIndex = lines.findIndex(function (line) { return /^##\s+Contents\b/i.test(line); });
    const frontLines = contentsIndex >= 0 ? lines.slice(0, contentsIndex) : [];
    const frontText = frontLines.filter(function (line) { return !/^#{1,6}\s+/.test(line); }).join('\n').trim();
    const sections = [];
    if (frontText) sections.push({ id: book.id + '-opening-note', title: 'The opening', group: 'Opening', kind: 'preface', content: frontText, index: 0 });
    const bodyLines = contentsIndex >= 0 ? lines.slice(contentsIndex + 1) : lines;
    const blocks = [];
    let block = null;
    bodyLines.forEach(function (line) {
      const match = line.match(/^##\s+(.+)$/);
      if (match) { if (block) blocks.push(block); block = { title: match[1].trim(), lines: [] }; }
      else if (block) block.lines.push(line);
    });
    if (block) blocks.push(block);
    let group = book.id === 'field-account' ? 'Part one · The application' : 'The journey';
    blocks.forEach(function (entry) {
      const title = entry.title.replace(/\s+#+\s*$/, '').trim();
      if (/^Contents$/i.test(title)) return;
      if (/^Part One\b/i.test(title)) { group = 'Part one · The application'; return; }
      if (/^Part Two\b/i.test(title)) { group = 'Part two · ServiceNow in context'; return; }
      if (/^Part Three\b/i.test(title)) { group = 'Part three · People and the agent'; return; }
      if (/^Appendix [A-I]\b/i.test(title)) group = 'Field guides & appendices';
      if (/^Sources(?: and further reading| and scope)?/i.test(title)) group = 'About this book';
      const content = entry.lines.join('\n').trim(), last = sections[sections.length - 1];
      if (last && last.title === title) { last.content = (last.content + '\n\n' + content).trim(); return; }
      if (!content) return;
      sections.push({
        id: slugify(book.id + '-' + title), title: title,
        group: book.id === 'field-account' ? classifySection(book, title) : group,
        kind: /^Appendix [A-Z]\b/i.test(title) ? 'appendix' : (/^Sources(?: and further reading| and scope)?/i.test(title) ? 'sources' : (/^Closing$/i.test(title) ? 'closing' : (/^Chapter\b|^\d+\b/.test(title) ? 'chapter' : 'section'))),
        content: content, index: sections.length
      });
    });
    sections.forEach(function (section, index) { section.index = index; });
    return { meta: book, sections: sections, raw: markdown };
  }
  function getSection(book, pattern) { return book.sections.find(function (section) { return pattern.test(section.title); }); }
  function extractFirstTable(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (!/^\s*\|/.test(lines[i]) || !isTableRule(lines[i + 1])) continue;
      const headers = splitTableCells(lines[i]), rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitTableCells(lines[i])); i += 1; }
      return { headers: headers, rows: rows };
    }
    return { headers: [], rows: [] };
  }
  function extractFigures(book) {
    const found = [];
    book.sections.forEach(function (section) {
      const lines = section.content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const match = lines[i].match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
        if (!match) continue;
        const captionMatch = (lines[i + 1] || '').trim().match(/^\*(.+)\*$/);
        found.push({ alt: match[1], src: safeAssetUrl(book.meta, match[2]), caption: captionMatch ? captionMatch[1].trim() : match[1], section: section.title });
      }
    });
    return found.filter(function (figure) { return !!figure.src; });
  }
  function readSet(bookId, type) {
    const value = storage.json('goodday:' + bookId + ':' + type, []);
    return new Set(Array.isArray(value) ? value : []);
  }
  function saveSet(bookId, type, values) { storage.set('goodday:' + bookId + ':' + type, JSON.stringify(Array.from(values))); }
  function updateProgress() {
    const book = data[activeBookId];
    if (!book) return;
    const read = readSet(activeBookId, 'read'), total = book.sections.length;
    const percent = total ? Math.round(read.size * 100 / total) : 0;
    el('progress-percent').textContent = percent + '%';
    el('progress-bar').setAttribute('aria-valuenow', String(percent));
    el('progress-bar').querySelector('span').style.width = percent + '%';
    el('progress-copy').textContent = read.size ? read.size + ' of ' + total + ' sections marked read.' : 'Choose a section to begin.';
    const last = storage.get('goodday:' + activeBookId + ':last', '');
    el('resume-button').hidden = !last || last === (book.sections[0] && book.sections[0].id);
  }
  function getCurrentIndexForBook(book) {
    const savedId = storage.get('goodday:' + book.meta.id + ':last', '');
    const index = book.sections.findIndex(function (section) { return section.id === savedId; });
    return index >= 0 ? index : 0;
  }
  function renderToc() {
    const book = data[activeBookId];
    if (!book) return;
    const container = el('table-of-contents'), filter = el('chapter-filter').value.trim().toLowerCase();
    container.innerHTML = '';
    let groupName = '', count = 0;
    book.sections.forEach(function (section, index) {
      if (filter && !(section.title + ' ' + section.group + ' ' + readPlainText(section.content)).toLowerCase().includes(filter)) return;
      if (section.group !== groupName) {
        groupName = section.group;
        const label = document.createElement('div');
        label.className = 'toc-group-label'; label.textContent = groupName; container.appendChild(label);
      }
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'toc-item' + (index === activeIndex ? ' is-current' : '');
      button.dataset.sectionIndex = String(index);
      button.setAttribute('aria-current', index === activeIndex ? 'page' : 'false');
      const number = document.createElement('span');
      number.className = 'toc-number'; number.textContent = String(index + 1).padStart(2, '0');
      const title = document.createElement('span');
      title.textContent = section.title;
      button.appendChild(number); button.appendChild(title);
      if (readSet(activeBookId, 'bookmarks').has(section.id)) {
        const saved = document.createElement('span');
        saved.className = 'toc-bookmark'; saved.setAttribute('aria-label', 'Saved'); saved.textContent = '◆'; button.appendChild(saved);
      }
      container.appendChild(button); count += 1;
    });
    if (!count) {
      const empty = document.createElement('p'); empty.className = 'toc-empty'; empty.textContent = 'No matching sections.'; container.appendChild(empty);
    }
  }
  function updateUrl() {
    const book = data[activeBookId];
    if (!book) return;
    const section = book.sections[activeIndex], url = new URL(window.location.href);
    url.searchParams.set('book', activeBookId);
    if (section) url.searchParams.set('section', section.id);
    url.hash = activeView || 'read';
    try { window.history.replaceState({}, '', url); } catch (_) {}
  }
  function renderReader() {
    const book = data[activeBookId];
    if (!book || !book.sections.length) return;
    activeIndex = Math.max(0, Math.min(activeIndex, book.sections.length - 1));
    const section = book.sections[activeIndex];
    let kicker = 'FIELD NOTE';
    if (section.kind === 'appendix') kicker = 'APPENDIX / FIELD GUIDE';
    else if (section.kind === 'preface') kicker = 'OPENING NOTE';
    else if (section.kind === 'sources') kicker = 'SOURCE NOTES';
    else if (section.kind === 'closing') kicker = 'CLOSING';
    else if (section.kind === 'chapter') kicker = 'CHAPTER / SECTION';
    el('reader-kicker').textContent = kicker;
    el('reader-page-label').textContent = book.meta.shortLabel;
    el('reader-title').textContent = section.title;
    el('section-count').textContent = String(activeIndex + 1).padStart(2, '0') + ' / ' + String(book.sections.length).padStart(2, '0');
    el('reader-body').innerHTML = renderMarkdown(section.content, book.meta);
    const bookmarks = readSet(activeBookId, 'bookmarks'), saved = bookmarks.has(section.id);
    el('bookmark-button').setAttribute('aria-pressed', String(saved));
    el('bookmark-button').querySelector('span').textContent = saved ? 'Saved' : 'Save';
    const read = readSet(activeBookId, 'read'), isRead = read.has(section.id);
    el('mark-read-button').setAttribute('aria-pressed', String(isRead));
    el('mark-read-button').querySelectorAll('span')[1].textContent = isRead ? 'Marked as read' : 'Mark section as read';
    const previous = book.sections[activeIndex - 1], next = book.sections[activeIndex + 1];
    el('previous-section').disabled = !previous; el('next-section').disabled = !next;
    el('previous-section').querySelector('strong').textContent = previous ? previous.title : 'Beginning of book';
    el('next-section').querySelector('strong').textContent = next ? next.title : 'End of this edition';
    storage.set('goodday:' + activeBookId + ':last', section.id);
    renderToc(); updateProgress(); updateUrl();
  }
  function setSection(index, scrollToReader) {
    const book = data[activeBookId];
    if (!book) return;
    activeIndex = Math.max(0, Math.min(index, book.sections.length - 1));
    renderReader();
    if (scrollToReader) el('reader-article').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeMobileNav() { el('mobile-nav').hidden = true; el('menu-toggle').setAttribute('aria-expanded', 'false'); }
  function activateView(view, scroll) {
    activeView = view;
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      const active = panel.dataset.panel === view;
      panel.hidden = !active; panel.classList.toggle('is-active', active);
    });
    document.querySelectorAll('[data-view]').forEach(function (button) {
      const active = button.dataset.view === view;
      button.classList.toggle('is-current', active);
      if (button.getAttribute('role') === 'tab') button.setAttribute('aria-selected', String(active));
    });
    if (view === 'read') renderReader();
    updateUrl();
    if (scroll) el('workbench').scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeMobileNav();
  }
  function selectBook(bookId, sectionId, shouldScroll) {
    if (!data[bookId]) return;
    activeBookId = bookId;
    let selected = sectionId ? data[bookId].sections.findIndex(function (section) { return section.id === sectionId || slugify(section.title) === sectionId; }) : -1;
    if (selected < 0) selected = getCurrentIndexForBook(data[bookId]);
    activeIndex = selected;
    const book = data[bookId].meta;
    el('edition-indicator').innerHTML = '<span class="edition-dot"></span><span>' + escapeHtml(book.label) + '</span>';
    renderReader();
    if (shouldScroll) {
      activateView('read', false);
      el('workbench').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  function collectTable(book, pattern) {
    const section = getSection(book, pattern);
    return section ? extractFirstTable(section.content) : { headers: [], rows: [] };
  }
  function renderTimeline() {
    const book = data['field-account'];
    if (!book) return;
    const section = getSection(book, /journey in six movements|milestone timeline/i);
    const table = section ? extractFirstTable(section.content) : { headers: [], rows: [] };
    const filter = el('timeline-filter'), selected = filter.value || 'all';
    filter.innerHTML = '<option value="all">All movements</option>';
    Array.from(new Set(table.rows.map(function (row) { return row[0] || ''; }).filter(Boolean))).forEach(function (period) {
      const option = document.createElement('option'); option.value = period; option.textContent = period; filter.appendChild(option);
    });
    filter.value = Array.from(filter.options).some(function (option) { return option.value === selected; }) ? selected : 'all';
    const rows = table.rows.filter(function (row) { return filter.value === 'all' || row[0] === filter.value; });
    el('timeline-count').textContent = rows.length + ' movements';
    el('timeline-list').innerHTML = rows.length ? rows.map(function (row) {
      return '<article class="timeline-item"><div class="timeline-period">' + escapeHtml(row[0] || '') + '</div><div class="timeline-copy"><p>' + escapeHtml(row[1] || '') + '</p><span class="timeline-source">A MOVEMENT IN THE STORY</span></div></article>';
    }).join('') : '<p class="empty-panel">No milestones match this period.</p>';
  }
  function renderFigures() {
    const book = data['field-account'];
    if (!book) return;
    figures = extractFigures(book);
    el('gallery-grid').innerHTML = figures.length ? figures.map(function (figure, index) {
      const label = 'FIGURE ' + String(index + 1).padStart(2, '0');
      const title = figure.alt || figure.caption;
      return '<button type="button" class="gallery-card" data-gallery-index="' + index + '" aria-label="Open ' + escapeHtml(title) + '"><span class="gallery-thumb"><img src="' + escapeHtml(figure.src) + '" alt="" loading="lazy"></span><span class="gallery-copy"><small>' + escapeHtml(label) + '</small><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(figure.section) + '</span></span></button>';
    }).join('') : '<p class="empty-panel">No figures were found in the book.</p>';
  }
  function renderGlossary() {
    const book = data['field-account'];
    if (!book) return;
    const section = getSection(book, /Working glossary/i), items = [];
    if (section) section.content.split(/\r?\n/).forEach(function (line) {
      const match = line.match(/^\s*-\s+\*\*(.+?)\*\*:\s*(.+)$/);
      if (match) items.push({ term: match[1], definition: match[2] });
    });
    const query = el('glossary-search').value.trim().toLowerCase();
    const filtered = items.filter(function (item) { return !query || (item.term + ' ' + item.definition).toLowerCase().includes(query); });
    el('glossary-count').textContent = filtered.length + ' of ' + items.length + ' terms';
    el('glossary-grid').innerHTML = filtered.length ? filtered.map(function (item) {
      return '<article class="glossary-card"><h4>' + escapeHtml(item.term) + '</h4><p>' + escapeHtml(item.definition) + '</p></article>';
    }).join('') : '<p class="glossary-empty">No glossary terms match your search.</p>';
  }
  function renderSources() {
    const cards = [
      { label: 'THE BOOK', title: BOOKS['field-account'].title, description: 'One continuous account of the Goodday story, the service design, and the human role around AI-assisted work.' }
    ];
    el('source-cards').innerHTML = cards.map(function (card) {
      return '<article class="source-card"><p class="eyebrow">' + escapeHtml(card.label) + '</p><h4>' + escapeHtml(card.title) + '</h4><p>' + escapeHtml(card.description) + '</p></article>';
    }).join('');
    const book = data['field-account'], section = book && getSection(book, /^Sources(?: and further reading| and scope)?/i);
    el('scope-content').innerHTML = section ? '<h3>About this book</h3>' + renderMarkdown(section.content, book.meta) : '<p>This is one consolidated public edition of the Goodday story.</p>';
  }
  function renderPrintBook() {
    const book = data['field-account'];
    if (!book) return;
    let markup = '<header class="print-cover"><p class="print-brand">GOODDAY FIELD NOTES</p><h1>Building Goodday</h1><p class="print-subtitle">From a family app to a connected service</p><p class="print-deck">A field story of AI-assisted building, connected systems, and human oversight.</p></header>';
    markup += '<section class="print-contents"><h2>Contents</h2><ol>' + book.sections.map(function (section) { return '<li>' + escapeHtml(section.title) + '</li>'; }).join('') + '</ol></section>';
    let previousGroup = '';
    book.sections.forEach(function (section) {
      if (section.group !== previousGroup && (section.group.indexOf('Part ') === 0 || section.group === 'Field guides & appendices')) {
        markup += '<h2 class="print-part">' + escapeHtml(section.group) + '</h2>';
      }
      previousGroup = section.group;
      const label = section.kind === 'appendix' ? 'FIELD GUIDE' : (section.kind === 'preface' ? 'OPENING' : (section.kind === 'sources' ? 'ABOUT THIS BOOK' : 'GOODDAY'));
      const printableContent = section.content.replace(/[—–−]/g, '-');
      const body = renderMarkdown(printableContent, book.meta).replace(/ loading="lazy"/g, '');
      markup += '<section class="print-chapter"><p class="print-kicker">' + label + '</p><h2>' + escapeHtml(section.title) + '</h2><div class="print-body">' + body + '</div></section>';
    });
    el('print-book').innerHTML = markup;
  }
  function highlight(text, query) {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    return index < 0 ? escapeHtml(text) : escapeHtml(text.slice(0, index)) + '<mark>' + escapeHtml(text.slice(index, index + query.length)) + '</mark>' + escapeHtml(text.slice(index + query.length));
  }
  function buildSearchResults(query) {
    const results = el('search-results'), normalized = query.trim().toLowerCase();
    if (normalized.length < 2) {
      results._matches = [];
      results.innerHTML = '<p class="empty-search">Enter at least two characters to search the book.</p>';
      return;
    }
    const matches = [];
    Object.keys(BOOKS).forEach(function (bookId) {
      const book = data[bookId];
      if (!book) return;
      book.sections.forEach(function (section, index) {
        const plain = readPlainText(section.title + ' ' + section.content), position = plain.toLowerCase().indexOf(normalized);
        if (position < 0) return;
        const start = Math.max(0, position - 55), end = Math.min(plain.length, position + normalized.length + 95);
        matches.push({ bookId: bookId, index: index, title: section.title, edition: book.meta.label, snippet: (start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '') });
      });
    });
    if (!matches.length) {
      results._matches = [];
      results.innerHTML = '<p class="no-results">No passages found. Try a broader term.</p>';
      return;
    }
    results._matches = matches.slice(0, 32);
    results.innerHTML = results._matches.map(function (result, index) {
      return '<button type="button" class="search-result" data-search-index="' + index + '"><span class="search-result-top"><span class="search-result-edition">' + escapeHtml(result.edition) + '</span><span class="search-result-edition">' + String(result.index + 1).padStart(2, '0') + '</span></span><strong class="search-result-title">' + escapeHtml(result.title) + '</strong><span class="search-result-snippet">' + highlight(result.snippet, normalized) + '</span></button>';
    }).join('');
  }
  function showToast(message) {
    let toast = el('toast');
    if (!toast) {
      toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast';
      toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); document.body.appendChild(toast);
    }
    toast.textContent = message; toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove('is-visible'); }, 2200);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      const textarea = document.createElement('textarea');
      textarea.value = text; textarea.setAttribute('readonly', ''); textarea.style.position = 'fixed'; textarea.style.opacity = '0';
      document.body.appendChild(textarea); textarea.select();
      try { document.execCommand('copy'); textarea.remove(); resolve(); }
      catch (error) { textarea.remove(); reject(error); }
    });
  }
  function currentShareUrl() {
    const book = data[activeBookId], section = book && book.sections[activeIndex], url = new URL(window.location.href);
    url.searchParams.set('book', activeBookId);
    if (section) url.searchParams.set('section', section.id);
    url.hash = 'read';
    return url.href;
  }
  function toggleBookmark() {
    const book = data[activeBookId], section = book && book.sections[activeIndex];
    if (!section) return;
    const bookmarks = readSet(activeBookId, 'bookmarks');
    if (bookmarks.has(section.id)) bookmarks.delete(section.id); else bookmarks.add(section.id);
    saveSet(activeBookId, 'bookmarks', bookmarks);
    renderReader();
    showToast(bookmarks.has(section.id) ? 'Section saved in this browser.' : 'Bookmark removed.');
  }
  function toggleRead() {
    const book = data[activeBookId], section = book && book.sections[activeIndex];
    if (!section) return;
    const read = readSet(activeBookId, 'read');
    if (read.has(section.id)) read.delete(section.id); else read.add(section.id);
    saveSet(activeBookId, 'read', read);
    renderReader();
  }
  function openSearch() {
    const dialog = el('search-dialog');
    if (!dialog.open) dialog.showModal();
    window.setTimeout(function () { el('global-search').focus(); }, 20);
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    storage.set('goodday:theme', theme);
    el('theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    el('theme-toggle').title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }
  function openFigure(index) {
    if (!figures.length) return;
    lightboxIndex = (index + figures.length) % figures.length;
    const figure = figures[lightboxIndex];
    el('lightbox-image').src = figure.src; el('lightbox-image').alt = figure.alt;
    el('lightbox-caption').textContent = figure.caption;
    el('lightbox-index').textContent = 'FIGURE ' + String(lightboxIndex + 1).padStart(2, '0') + ' / ' + String(figures.length).padStart(2, '0');
    if (!el('image-dialog').open) el('image-dialog').showModal();
  }
  function initializePanels() {
    document.querySelectorAll('[data-view]').forEach(function (button) {
      button.addEventListener('click', function () { activateView(button.dataset.view, true); });
    });
    document.querySelectorAll('[data-open-book]').forEach(function (button) {
      button.addEventListener('click', function () { selectBook(button.dataset.openBook, null, true); });
    });
    document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
      button.addEventListener('click', function () { el(button.dataset.closeDialog).close(); });
    });
    ['search-dialog', 'image-dialog', 'help-dialog'].forEach(function (id) {
      const dialog = el(id);
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    });
  }
  function initializeEvents() {
    el('table-of-contents').addEventListener('click', function (event) {
      const button = event.target.closest('[data-section-index]');
      if (button) setSection(Number(button.dataset.sectionIndex), false);
    });
    el('chapter-filter').addEventListener('input', renderToc);
    el('clear-chapter-filter').addEventListener('click', function () { el('chapter-filter').value = ''; renderToc(); el('chapter-filter').focus(); });
    el('previous-section').addEventListener('click', function () { setSection(activeIndex - 1, true); });
    el('next-section').addEventListener('click', function () { setSection(activeIndex + 1, true); });
    el('bookmark-button').addEventListener('click', toggleBookmark);
    el('mark-read-button').addEventListener('click', toggleRead);
    el('share-button').addEventListener('click', function () {
      copyText(currentShareUrl()).then(function () { showToast('Section link copied.'); }).catch(function () { showToast('Copy is unavailable in this browser.'); });
    });
    el('font-smaller').addEventListener('click', function () {
      const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-size')) || 1.08;
      const next = Math.max(.92, Math.round((current - .06) * 100) / 100);
      document.documentElement.style.setProperty('--reader-size', next + 'rem'); storage.set('goodday:font-size', String(next));
    });
    el('font-larger').addEventListener('click', function () {
      const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reader-size')) || 1.08;
      const next = Math.min(1.46, Math.round((current + .06) * 100) / 100);
      document.documentElement.style.setProperty('--reader-size', next + 'rem'); storage.set('goodday:font-size', String(next));
    });
    el('search-open').addEventListener('click', openSearch);
    el('mobile-search-open').addEventListener('click', function () { closeMobileNav(); openSearch(); });
    el('global-search').addEventListener('input', function () { buildSearchResults(this.value); });
    el('search-results').addEventListener('click', function (event) {
      const button = event.target.closest('[data-search-index]');
      if (!button || !event.currentTarget._matches) return;
      const result = event.currentTarget._matches[Number(button.dataset.searchIndex)];
      if (!result) return;
      el('search-dialog').close();
      selectBook(result.bookId, data[result.bookId].sections[result.index].id, true);
    });
    el('timeline-filter').addEventListener('change', renderTimeline);
    el('glossary-search').addEventListener('input', renderGlossary);
    el('gallery-grid').addEventListener('click', function (event) {
      const button = event.target.closest('[data-gallery-index]');
      if (button) openFigure(Number(button.dataset.galleryIndex));
    });
    el('reader-body').addEventListener('click', function (event) {
      const image = event.target.closest('figure img');
      if (!image) return;
      const index = figures.findIndex(function (figure) { return figure.src === image.src; });
      if (index >= 0) openFigure(index);
    });
    el('image-previous').addEventListener('click', function () { openFigure(lightboxIndex - 1); });
    el('image-next').addEventListener('click', function () { openFigure(lightboxIndex + 1); });
    el('theme-toggle').addEventListener('click', function () { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); });
    el('menu-toggle').addEventListener('click', function () {
      const expanded = el('menu-toggle').getAttribute('aria-expanded') === 'true';
      el('menu-toggle').setAttribute('aria-expanded', String(!expanded));
      el('mobile-nav').hidden = expanded;
    });
    el('help-open').addEventListener('click', function () { el('help-dialog').showModal(); });
    el('resume-button').addEventListener('click', function () {
      const book = data[activeBookId], saved = storage.get('goodday:' + activeBookId + ':last', '');
      const index = book.sections.findIndex(function (section) { return section.id === saved; });
      setSection(index >= 0 ? index : 0, true);
    });
    document.addEventListener('keydown', function (event) {
      const target = event.target, typing = target && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable);
      if (event.key === '/' && !typing) { event.preventDefault(); openSearch(); return; }
      if (event.key === '?' && !typing && !el('search-dialog').open && !el('image-dialog').open) { el('help-dialog').showModal(); return; }
      if (el('image-dialog').open && event.key === 'ArrowLeft') { event.preventDefault(); openFigure(lightboxIndex - 1); return; }
      if (el('image-dialog').open && event.key === 'ArrowRight') { event.preventDefault(); openFigure(lightboxIndex + 1); return; }
      if (typing || activeView !== 'read' || el('search-dialog').open || el('help-dialog').open || el('image-dialog').open) return;
      if (event.key === 'ArrowLeft') setSection(activeIndex - 1, false);
      if (event.key === 'ArrowRight') setSection(activeIndex + 1, false);
      if (event.key.toLowerCase() === 'b') toggleBookmark();
    });
  }
  async function loadBook(bookId) {
    const book = BOOKS[bookId], response = await fetch(book.path);
    if (!response.ok) throw new Error('Could not load ' + book.path + ' (' + response.status + ')');
    data[bookId] = parseBook(book, await response.text());
  }
  async function initialize() {
    setTheme(storage.get('goodday:theme', 'light') === 'dark' ? 'dark' : 'light');
    const savedFont = parseFloat(storage.get('goodday:font-size', '1.08'));
    if (Number.isFinite(savedFont)) document.documentElement.style.setProperty('--reader-size', savedFont + 'rem');
    initializePanels(); initializeEvents();
    try {
      await Promise.all(Object.keys(BOOKS).map(loadBook));
      const params = new URLSearchParams(window.location.search);
      activeBookId = BOOKS[params.get('book')] ? params.get('book') : 'field-account';
      const book = data[activeBookId], requestedSection = params.get('section');
      el('chapter-count').textContent = book.sections.filter(function (section) { return section.kind === 'chapter'; }).length;
      el('guide-count').textContent = book.sections.filter(function (section) { return section.kind === 'appendix'; }).length;
      const requestedIndex = book.sections.findIndex(function (section) { return section.id === requestedSection; });
      activeIndex = requestedIndex >= 0 ? requestedIndex : getCurrentIndexForBook(book);
      const hashView = window.location.hash.replace(/^#/, '');
      activeView = ['read', 'timeline', 'gallery', 'glossary', 'sources'].includes(hashView) ? hashView : 'read';
      el('edition-indicator').innerHTML = '<span class="edition-dot"></span><span>' + escapeHtml(book.meta.label) + '</span>';
      renderReader(); renderTimeline(); renderFigures(); renderGlossary(); renderSources(); renderPrintBook();
      activateView(activeView, false);
    } catch (error) {
      el('reader-title').textContent = 'The manuscript could not be loaded.';
      el('reader-body').innerHTML = '<p>Open the consolidated book source in the repository, or load this page from a local web server or GitHub Pages. Browser restrictions block fetching these files from a file URL.</p>';
      console.error(error);
    }
    if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
      navigator.serviceWorker.register('./sw.js').catch(function (error) { console.warn('Offline reading is unavailable.', error); });
    }
  }
  initialize();
})();
