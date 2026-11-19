// Text anchors deliberately refer to content, rather than the current HTML structure.
const REGION_SELECTOR = '[data-comment-region]';
const NON_CONTENT_SELECTOR = 'script, style, noscript, button, input, select, textarea, form, dialog, nav, [data-comments-ui]';
const EXCLUDED_SELECTOR = `${NON_CONTENT_SELECTOR}, [hidden], [aria-hidden="true"]`;
const CONTEXT_LENGTH = 64;
const MAX_QUOTE_LENGTH = 2000;

export function getRegions({ includeHidden = false } = {}) {
  return [...document.querySelectorAll(REGION_SELECTOR)].filter(region => !region.closest(includeHidden ? NON_CONTENT_SELECTOR : EXCLUDED_SELECTOR));
}

function closestRegion(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return element?.closest(REGION_SELECTOR) || null;
}

function eligibleNode(node, region, includeHidden) {
  const parent = node.parentElement;
  const insideScope = region.matches('main') ? region.contains(node) : closestRegion(node) === region;
  return !!node.data && !!parent && insideScope && !parent.closest(includeHidden ? NON_CONTENT_SELECTOR : EXCLUDED_SELECTOR);
}

export function getTextModel(region, { includeHidden = false } = {}) {
  if (!region) return { region: null, text: '', nodes: [] };
  const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT, {
    acceptNode: node => eligibleNode(node, region, includeHidden) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  const nodes = [];
  const pieces = [];
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node, start: offset, end: offset + node.data.length });
    pieces.push(node.data);
    offset += node.data.length;
  }
  return { region, text: pieces.join(''), nodes };
}

export function rangeFromOffsets(model, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > model.text.length) return null;
  // At a text-node boundary, prefer the following node for the start and the
  // preceding node for the end. This avoids selecting unrelated inline elements.
  const first = model.nodes.find(part => part.end > start);
  const last = model.nodes.find(part => part.end >= end && part.start < end);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return range;
}

function invalidSelection(error) {
  return { anchor: null, range: null, region: null, error };
}

export function captureSelection(selection = window.getSelection()) {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return invalidSelection('Select some page text first.');
  const selectedRange = selection.getRangeAt(0);
  const startElement = selectedRange.startContainer.nodeType === Node.ELEMENT_NODE ? selectedRange.startContainer : selectedRange.startContainer.parentElement;
  const endElement = selectedRange.endContainer.nodeType === Node.ELEMENT_NODE ? selectedRange.endContainer : selectedRange.endContainer.parentElement;
  let region = closestRegion(selectedRange.startContainer);
  if (!region || closestRegion(selectedRange.endContainer) !== region) {
    const startMain = startElement?.closest('main');
    const endMain = endElement?.closest('main');
    region = startMain && startMain === endMain ? startMain : null;
  }
  if (!region || region.closest(EXCLUDED_SELECTOR)) return invalidSelection('Select text within the page content.');
  if (startElement?.closest(EXCLUDED_SELECTOR) || endElement?.closest(EXCLUDED_SELECTOR)) return invalidSelection('Select page content to comment on.');
  if (region.matches('main') && [...region.querySelectorAll(REGION_SELECTOR)].some(candidate => candidate.closest('[hidden], [aria-hidden="true"]'))) {
    return invalidSelection('Select text within one opportunity while filters are active.');
  }

  const model = getTextModel(region);
  let start = null;
  let end = null;
  for (const part of model.nodes) {
    // comparePoint returns -1 before the selected range, 0 within it, 1 after it.
    if (selectedRange.comparePoint(part.node, part.node.length) === -1 || selectedRange.comparePoint(part.node, 0) === 1) continue;
    const localStart = part.node === selectedRange.startContainer ? selectedRange.startOffset : 0;
    const localEnd = part.node === selectedRange.endContainer ? selectedRange.endOffset : part.node.length;
    if (localEnd <= localStart) continue;
    if (start === null) start = part.start + localStart;
    end = part.start + localEnd;
  }
  if (start === null || end === null || end <= start) return invalidSelection('Select some page text first.');
  const exact = model.text.slice(start, end);
  if (!exact.trim()) return invalidSelection('Select some page text first.');
  if (exact.length > MAX_QUOTE_LENGTH) return invalidSelection('Select up to 2,000 characters at a time.');
  const sectionId = region.matches('main') ? '__main__' : region.getAttribute('data-comment-region');
  if (!sectionId || sectionId.length > 100) return invalidSelection('This page section cannot receive comments.');
  return {
    anchor: {
      exact,
      prefix: model.text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
      suffix: model.text.slice(end, end + CONTEXT_LENGTH),
      start,
      end,
      sectionId,
    },
    range: rangeFromOffsets(model, start, end),
    region,
    error: null,
  };
}

function commonSuffixLength(left, right) {
  let count = 0;
  while (count < left.length && count < right.length && left[left.length - 1 - count] === right[right.length - 1 - count]) count++;
  return count;
}

function commonPrefixLength(left, right) {
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) count++;
  return count;
}

function isValidAnchor(anchor) {
  return anchor && typeof anchor.exact === 'string' && anchor.exact.length > 0 && anchor.exact.length <= MAX_QUOTE_LENGTH &&
    typeof anchor.sectionId === 'string' && anchor.sectionId.length > 0 && anchor.sectionId.length <= 100 &&
    typeof anchor.prefix === 'string' && anchor.prefix.length <= CONTEXT_LENGTH &&
    typeof anchor.suffix === 'string' && anchor.suffix.length <= CONTEXT_LENGTH &&
    Number.isInteger(anchor.start) && Number.isInteger(anchor.end) && anchor.start >= 0 && anchor.end > anchor.start &&
    anchor.end - anchor.start === anchor.exact.length;
}

export function resolveAnchor(anchor) {
  if (!isValidAnchor(anchor)) return { range: null, region: null, status: 'missing' };
  const region = anchor.sectionId === '__main__' ? document.querySelector('main') : getRegions({ includeHidden: true }).find(candidate => candidate.getAttribute('data-comment-region') === anchor.sectionId);
  if (!region) return { range: null, region: null, status: 'missing' };
  // A directory filter can hide a region without changing its text. Keep its
  // anchor resolvable; the UI distinguishes hidden text from edited/deleted text.
  const model = getTextModel(region, { includeHidden: true });
  const { text } = model;
  const samePrefix = text.slice(Math.max(0, anchor.start - anchor.prefix.length), anchor.start) === anchor.prefix;
  const sameSuffix = text.slice(anchor.end, anchor.end + anchor.suffix.length) === anchor.suffix;
  if (text.slice(anchor.start, anchor.end) === anchor.exact && samePrefix && sameSuffix) {
    return { range: rangeFromOffsets(model, anchor.start, anchor.end), region, status: 'matched' };
  }

  const matches = [];
  for (let index = text.indexOf(anchor.exact); index !== -1; index = text.indexOf(anchor.exact, index + 1)) {
    const before = text.slice(Math.max(0, index - CONTEXT_LENGTH), index);
    const after = text.slice(index + anchor.exact.length, index + anchor.exact.length + CONTEXT_LENGTH);
    const prefixScore = commonSuffixLength(anchor.prefix, before);
    const suffixScore = commonPrefixLength(anchor.suffix, after);
    matches.push({ index, score: prefixScore + suffixScore, fullContext: before.endsWith(anchor.prefix) && after.startsWith(anchor.suffix) });
  }
  if (!matches.length) return { range: null, region, status: 'missing' };
  let found = matches.length === 1 ? matches[0] : null;
  if (!found) {
    const full = matches.filter(match => match.fullContext);
    if (full.length === 1) found = full[0];
    else {
      matches.sort((a, b) => b.score - a.score);
      // Context must meaningfully and uniquely distinguish a repeated quote.
      if (matches[0].score >= 8 && matches[0].score > matches[1].score) found = matches[0];
    }
  }
  if (!found) return { range: null, region, status: 'ambiguous' };
  return { range: rangeFromOffsets(model, found.index, found.index + anchor.exact.length), region, status: 'reattached' };
}
