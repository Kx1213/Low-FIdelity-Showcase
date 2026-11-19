import { firebaseConfig } from './firebase-config.js';
import { captureSelection, resolveAnchor } from './comment-anchors.js';

const pageId = document.body.dataset.commentPage;

if (pageId) {
  const THREAD_BATCH = 200;
  const REPLY_BATCH = 100;
  let threadLimit = THREAD_BATCH;
  const threadCards = new Map();
  const anchorLocations = new Map();
  const supportsHighlights = Boolean(window.CSS?.highlights && window.Highlight);
  let servicesPromise;
  let signInPromise;
  let stopThreads;
  let listenerGeneration = 0;
  let pendingSelection;
  let composerAnchor;
  let returnFocus;
  let activeThread;
  let loading = true;
  let serverConfirmed = false;
  let loadError = false;
  let selectionTimer;
  let displayName = '';

  try { displayName = localStorage.getItem('b71-comment-name') || ''; } catch { /* Storage is optional. */ }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, text) {
    const node = make('button', className, text);
    node.type = 'button';
    return node;
  }

  const ui = make('div', 'comments-ui');
  ui.dataset.commentsUi = '';
  const launcher = button('comments-launcher', 'Comments');
  launcher.setAttribute('aria-controls', 'comments-panel');
  launcher.setAttribute('aria-expanded', 'false');
  const count = make('span', 'comments-count', '0');
  count.setAttribute('aria-hidden', 'true');
  launcher.append(count);

  const selectionButton = button('comments-selection-button', '＋ Add comment');
  selectionButton.hidden = true;
  selectionButton.setAttribute('aria-keyshortcuts', 'Alt+Shift+C');

  const panel = make('aside', 'comments-panel');
  panel.id = 'comments-panel';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'comments-title');
  const panelHeader = make('div', 'comments-panel-header');
  const heading = make('h2', '', 'Comments');
  heading.id = 'comments-title';
  heading.tabIndex = -1;
  const closeButton = button('comments-close', '×');
  closeButton.setAttribute('aria-label', 'Close comments');
  panelHeader.append(heading, closeButton);
  const panelBody = make('div', 'comments-panel-body');
  const introduction = make('p', 'comments-introduction', 'Highlight text on this page, then choose Add comment. Everyone can read the comments.');
  const selectButton = button('comments-text-button comments-select-text', 'Select text on the page');
  const connection = make('div', 'comments-connection');
  const connectionText = make('p', 'comments-connection-text', 'Connecting to comments…');
  connectionText.setAttribute('role', 'status');
  const retryButton = button('comments-text-button', 'Try again');
  retryButton.hidden = true;
  connection.append(connectionText, retryButton);

  const composer = make('form', 'comments-composer');
  composer.hidden = true;
  const composerTitle = make('h3', '', 'New comment');
  const composerQuote = make('blockquote', 'comments-composer-quote');
  const nameLabel = make('label', 'comments-field', 'Your name (optional)');
  const nameInput = make('input');
  nameInput.type = 'text';
  nameInput.maxLength = 80;
  nameInput.autocomplete = 'nickname';
  nameInput.placeholder = 'Guest';
  nameInput.value = displayName;
  nameLabel.append(nameInput);
  const textLabel = make('label', 'comments-field', 'Your comment');
  const commentInput = make('textarea');
  commentInput.required = true;
  commentInput.maxLength = 2000;
  commentInput.rows = 4;
  commentInput.placeholder = 'Share your feedback…';
  textLabel.append(commentInput);
  const publicNote = make('p', 'comments-public-note', 'Your name and comment will be public.');
  const composerStatus = make('p', 'comments-form-status');
  composerStatus.setAttribute('role', 'status');
  const composerActions = make('div', 'comments-form-actions');
  const cancelButton = button('comments-secondary-button', 'Cancel');
  const submitButton = button('comments-primary-button', 'Post comment');
  submitButton.type = 'submit';
  composerActions.append(cancelButton, submitButton);
  composer.append(composerTitle, composerQuote, nameLabel, textLabel, publicNote, composerStatus, composerActions);

  const emptyMessage = make('p', 'comments-empty', 'Loading comments…');
  const olderThreadsButton = button('comments-secondary-button comments-load-older', 'Load older comments');
  olderThreadsButton.hidden = true;
  const threadList = make('div', 'comments-thread-list');
  const limitNote = make('p', 'comments-limit-note');
  panelBody.append(introduction, selectButton, composer, connection, emptyMessage, olderThreadsButton, threadList, limitNote);
  panel.append(panelHeader, panelBody);
  const announcement = make('p', 'sr-only');
  announcement.setAttribute('role', 'status');
  ui.append(launcher, selectionButton, panel, announcement);
  document.body.append(ui);

  function openPanel(focusTarget = heading) {
    if (panel.hidden) {
      returnFocus = document.activeElement;
      panel.hidden = false;
      document.body.classList.add('comments-open');
      launcher.setAttribute('aria-expanded', 'true');
    }
    focusTarget?.focus({ preventScroll: true });
  }

  function closePanel() {
    if (panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove('comments-open');
    launcher.setAttribute('aria-expanded', 'false');
    const target = returnFocus?.isConnected && !panel.contains(returnFocus) ? returnFocus : launcher;
    target?.focus({ preventScroll: true });
  }

  launcher.addEventListener('click', () => panel.hidden ? openPanel() : closePanel());
  closeButton.addEventListener('click', closePanel);
  selectButton.addEventListener('click', () => {
    closePanel();
    announcement.textContent = 'Select text on the page, then choose Add comment. You can also press Alt Shift C after selecting text.';
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      closePanel();
    }
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'c' && !event.target.closest('input, textarea, select, [contenteditable="true"]')) {
      event.preventDefault();
      const captured = captureSelection();
      if (captured.anchor) beginComment(captured.anchor);
      else openPanel();
    }
  });

  function positionSelectionButton() {
    if (!pendingSelection?.range || selectionButton.hidden) return;
    const rect = pendingSelection.range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      selectionButton.hidden = true;
      return;
    }
    const viewport = window.visualViewport;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const leftOffset = viewport?.offsetLeft || 0;
    const topOffset = viewport?.offsetTop || 0;
    const buttonWidth = selectionButton.offsetWidth || 156;
    let top = rect.bottom + 9;
    if (top + 46 > topOffset + height) top = rect.top - 50;
    selectionButton.style.left = `${Math.max(leftOffset + 8, Math.min(rect.left, leftOffset + width - buttonWidth - 8))}px`;
    selectionButton.style.top = `${Math.max(topOffset + 8, Math.min(top, topOffset + height - 48))}px`;
  }

  function updateSelection() {
    const selection = window.getSelection();
    if (selection?.anchorNode?.parentElement?.closest('[data-comments-ui]')) {
      pendingSelection = null;
      selectionButton.hidden = true;
      return;
    }
    const captured = captureSelection(selection);
    pendingSelection = captured.anchor ? captured : null;
    selectionButton.hidden = !pendingSelection;
    if (pendingSelection) positionSelectionButton();
  }

  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(updateSelection, 120);
  });
  document.addEventListener('keyup', event => {
    if (event.shiftKey || event.key.startsWith('Arrow')) updateSelection();
  });
  document.addEventListener('pointerup', event => {
    if (event.target.closest('[data-comments-ui]')) return;
    setTimeout(updateSelection, 0);
    if (event.target.closest('a, button, input, textarea, select, [contenteditable="true"]') || !window.getSelection()?.isCollapsed) return;
    for (const [id, location] of anchorLocations) {
      if (!location.range) continue;
      const hit = [...location.range.getClientRects()].some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
      if (hit) {
        openPanel(threadCards.get(id)?.quoteButton);
        activateThread(id, false);
        threadCards.get(id)?.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        break;
      }
    }
  });
  window.addEventListener('scroll', positionSelectionButton, { passive: true });
  window.addEventListener('resize', positionSelectionButton, { passive: true });
  window.visualViewport?.addEventListener('resize', positionSelectionButton, { passive: true });
  selectionButton.addEventListener('pointerdown', event => event.preventDefault());
  selectionButton.addEventListener('click', () => {
    if (pendingSelection?.anchor) beginComment(pendingSelection.anchor);
  });

  function beginComment(anchor) {
    if (composer.getAttribute('aria-busy') === 'true') {
      composerStatus.textContent = 'Your comment is saving. Please wait for it to finish before commenting on another passage.';
      selectionButton.hidden = true;
      openPanel(heading);
      return;
    }
    const sameAnchor = composerAnchor && ['sectionId', 'start', 'end', 'exact'].every(key => composerAnchor[key] === anchor[key]);
    if (composerAnchor && commentInput.value.trim() && !sameAnchor) {
      composerStatus.textContent = 'Post or cancel your current draft before commenting on another passage.';
      selectionButton.hidden = true;
      openPanel(commentInput);
      composer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    composerAnchor = { ...anchor };
    composerQuote.textContent = anchor.exact;
    composer.hidden = false;
    composerStatus.textContent = '';
    selectionButton.hidden = true;
    openPanel(commentInput);
    composer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    updateHighlights();
  }

  cancelButton.addEventListener('click', () => {
    composer.hidden = true;
    composerAnchor = null;
    commentInput.value = '';
    composerStatus.textContent = '';
    heading.focus({ preventScroll: true });
    updateHighlights();
  });

  async function getServices() {
    if (!servicesPromise) {
      servicesPromise = Promise.all([
        import('https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js')
      ]).then(([appSdk, authSdk, firestoreSdk]) => {
        const app = appSdk.getApps().find(item => item.name === 'website-comments') || appSdk.initializeApp(firebaseConfig, 'website-comments');
        return { ...authSdk, ...firestoreSdk, auth: authSdk.getAuth(app), db: firestoreSdk.getFirestore(app) };
      }).catch(error => {
        servicesPromise = null;
        throw error;
      });
    }
    return servicesPromise;
  }

  async function getAuthor(services) {
    await services.auth.authStateReady();
    if (services.auth.currentUser) return services.auth.currentUser;
    if (!signInPromise) {
      signInPromise = services.signInAnonymously(services.auth).then(credential => credential.user).finally(() => { signInPromise = null; });
    }
    return signInPromise;
  }

  function saveName(value) {
    displayName = value.trim().slice(0, 80);
    nameInput.value = displayName;
    try { localStorage.setItem('b71-comment-name', displayName); } catch { /* Comments never depend on local storage. */ }
  }

  function friendlyError(error, action = 'save your comment') {
    if (!navigator.onLine) return 'You are offline. Your draft is still here. Reconnect and try again.';
    if (error?.code === 'permission-denied' || error?.code === 'auth/operation-not-allowed') return `Comments are temporarily unavailable. We could not ${action}. Please try again.`;
    if (error?.code === 'auth/too-many-requests' || error?.code === 'resource-exhausted') return 'Comments are busy right now. Please wait a moment and try again.';
    return `Could not ${action}. Check your connection and try again. Your draft is still here.`;
  }

  async function submitMessage({ form, input, name, status, submit, create, afterSave }) {
    if (form.getAttribute('aria-busy') === 'true') return;
    const text = input.value.trim();
    if (!text || text.length > 2000) {
      status.textContent = 'Enter a comment of up to 2,000 characters.';
      input.focus();
      return;
    }
    if (!navigator.onLine) {
      status.textContent = friendlyError();
      return;
    }
    const nameValue = name.value.trim();
    saveName(nameValue);
    const controls = [...form.querySelectorAll('input, textarea, button')];
    controls.forEach(control => { control.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Saving to Firebase…';
    const slowSave = setTimeout(() => {
      status.textContent = 'Still waiting for Firebase. Keep this page open while your comment saves.';
    }, 12000);
    try {
      const services = await getServices();
      const author = await getAuthor(services);
      await create(services, {
        authorUid: author.uid,
        name: nameValue || 'Guest',
        text,
        createdAt: services.serverTimestamp()
      });
      input.value = '';
      status.textContent = 'Posted. Everyone can now read your comment.';
      announcement.textContent = 'Your comment was posted.';
      afterSave?.();
    } catch (error) {
      console.error('Comments: posting failed', error?.code || error?.name || 'unknown');
      status.textContent = friendlyError(error);
    } finally {
      clearTimeout(slowSave);
      controls.forEach(control => { control.disabled = false; });
      form.removeAttribute('aria-busy');
      submit.textContent = submit === submitButton ? 'Post comment' : 'Post reply';
    }
  }

  composer.addEventListener('submit', event => {
    event.preventDefault();
    if (!composerAnchor) return;
    const anchor = { ...composerAnchor };
    submitMessage({
      form: composer, input: commentInput, name: nameInput, status: composerStatus, submit: submitButton,
      create: (services, message) => services.addDoc(services.collection(services.db, 'pageComments', pageId, 'threads'), { ...message, anchor }),
      afterSave: () => {
        composer.hidden = true;
        composerAnchor = null;
        window.getSelection()?.removeAllRanges();
        heading.focus({ preventScroll: true });
        updateHighlights();
      }
    });
  });

  function dateText(timestamp, pending = false) {
    if (pending) return 'Saving…';
    const date = timestamp?.toDate?.();
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Just now';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  }

  function activateThread(id, scroll = true) {
    activeThread = id;
    updateHighlights();
    const card = threadCards.get(id);
    const location = anchorLocations.get(id);
    if (!location?.range) {
      if (card) card.anchorStatus.textContent = 'The selected text has changed. The original quote is kept above.';
      return;
    }
    if (!location.range.getClientRects().length) {
      card.anchorStatus.textContent = 'This text is hidden by the current page filters. Clear the filters to view it.';
      return;
    }
    card.anchorStatus.textContent = '';
    if (scroll) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(location.range.cloneRange());
      const target = location.range.startContainer.nodeType === Node.ELEMENT_NODE ? location.range.startContainer : location.range.startContainer.parentElement;
      target?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      selectionButton.hidden = true;
    }
  }

  function updateHighlights() {
    anchorLocations.clear();
    for (const [id, card] of threadCards) {
      const location = resolveAnchor(card.data.anchor);
      anchorLocations.set(id, location);
      card.element.classList.toggle('comments-thread-active', id === activeThread);
      const changed = !location.range;
      const filtered = Boolean(location.region?.closest('[hidden]'));
      card.anchorStatus.textContent = changed ? 'The selected text has changed. The original quote is kept above.' : filtered ? 'This text is hidden by the current page filters. Clear the filters to view it.' : '';
    }
    if (!supportsHighlights) return;
    const ranges = [...anchorLocations.values()].filter(location => location.range).map(location => location.range);
    CSS.highlights.set('website-comments', new Highlight(...ranges));
    const activeRanges = [];
    if (anchorLocations.get(activeThread)?.range) activeRanges.push(anchorLocations.get(activeThread).range);
    if (composerAnchor) {
      const composing = resolveAnchor(composerAnchor);
      if (composing.range) activeRanges.push(composing.range);
    }
    CSS.highlights.set('website-comment-active', new Highlight(...activeRanges));
  }

  function makeThread(id) {
    const element = make('article', 'comments-thread');
    element.id = `comment-${id}`;
    const quoteButton = button('comments-quote');
    quoteButton.title = 'Go to this text on the page';
    const anchorStatus = make('p', 'comments-anchor-status');
    const meta = make('div', 'comments-meta');
    const author = make('strong');
    const time = make('time');
    meta.append(author, time);
    const text = make('p', 'comments-message');
    const repliesToggle = button('comments-text-button comments-replies-toggle', 'Reply');
    repliesToggle.setAttribute('aria-expanded', 'false');
    const replies = make('div', 'comments-replies');
    replies.id = `comment-replies-${id}`;
    repliesToggle.setAttribute('aria-controls', replies.id);
    replies.hidden = true;
    const replyStatus = make('p', 'comments-form-status', 'Loading replies…');
    replyStatus.setAttribute('role', 'status');
    const replyRetry = button('comments-text-button', 'Retry replies');
    replyRetry.hidden = true;
    const olderRepliesButton = button('comments-secondary-button comments-load-older', 'Load older replies');
    olderRepliesButton.hidden = true;
    let replyLimit = REPLY_BATCH;
    let repliesLoading = false;
    const replyList = make('div', 'comments-reply-list');
    const replyForm = make('form', 'comments-reply-form');
    const replyNameLabel = make('label', 'comments-field', 'Your name (optional)');
    const replyName = make('input');
    replyName.type = 'text';
    replyName.maxLength = 80;
    replyName.autocomplete = 'nickname';
    replyName.placeholder = 'Guest';
    replyName.value = displayName;
    replyNameLabel.append(replyName);
    const replyLabel = make('label', 'comments-field', 'Your reply');
    const replyInput = make('textarea');
    replyInput.rows = 3;
    replyInput.required = true;
    replyInput.maxLength = 2000;
    replyLabel.append(replyInput);
    const replyPublicNote = make('p', 'comments-public-note', 'Your name and reply will be public.');
    const replyFormStatus = make('p', 'comments-form-status');
    replyFormStatus.setAttribute('role', 'status');
    const replySubmit = button('comments-primary-button', 'Post reply');
    replySubmit.type = 'submit';
    replyForm.append(replyNameLabel, replyLabel, replyPublicNote, replyFormStatus, replySubmit);
    replies.append(replyStatus, replyRetry, olderRepliesButton, replyList, replyForm);
    element.append(quoteButton, anchorStatus, meta, text, repliesToggle, replies);
    const card = { element, quoteButton, anchorStatus, author, time, text, data: {}, stopReplies: null };

    quoteButton.addEventListener('click', () => activateThread(id));
    async function listenToReplies() {
      card.stopReplies?.();
      card.stopReplies = null;
      repliesLoading = true;
      olderRepliesButton.disabled = true;
      replyStatus.textContent = 'Loading replies…';
      replyRetry.hidden = true;
      try {
        const services = await getServices();
        if (replies.hidden || !element.isConnected) return;
        const reference = services.collection(services.db, 'pageComments', pageId, 'threads', id, 'replies');
        const query = services.query(reference, services.orderBy('createdAt', 'desc'), services.limit(replyLimit));
        card.stopReplies = services.onSnapshot(query, { includeMetadataChanges: true }, snapshot => {
          const docs = [...snapshot.docs].reverse();
          repliesLoading = false;
          olderRepliesButton.disabled = false;
          olderRepliesButton.textContent = 'Load older replies';
          olderRepliesButton.hidden = docs.length < replyLimit;
          const fragment = document.createDocumentFragment();
          for (const doc of docs) {
            const data = doc.data();
            const reply = make('article', 'comments-reply');
            const replyMeta = make('div', 'comments-meta');
            replyMeta.append(make('strong', '', typeof data.name === 'string' ? data.name : 'Guest'), make('time', '', dateText(data.createdAt, doc.metadata.hasPendingWrites)));
            reply.append(replyMeta, make('p', 'comments-message', typeof data.text === 'string' ? data.text : ''));
            fragment.append(reply);
          }
          replyList.replaceChildren(fragment);
          replyStatus.textContent = docs.length >= replyLimit ? `Showing ${docs.length} replies. Load older replies to see more.` : docs.length ? '' : snapshot.metadata.fromCache ? 'Connecting to replies…' : 'No replies yet.';
          repliesToggle.textContent = docs.length ? `Replies (${docs.length}${docs.length >= replyLimit ? '+' : ''})` : 'Reply';
          replyRetry.hidden = true;
        }, error => {
          repliesLoading = false;
          olderRepliesButton.disabled = false;
          olderRepliesButton.textContent = 'Load older replies';
          console.error('Comments: replies unavailable', error?.code || 'unknown');
          replyStatus.textContent = 'Could not load replies. Please try again.';
          replyRetry.hidden = false;
        });
      } catch (error) {
        repliesLoading = false;
        olderRepliesButton.disabled = false;
        olderRepliesButton.textContent = 'Load older replies';
        replyStatus.textContent = 'Could not load replies. Check your connection and try again.';
        replyRetry.hidden = false;
      }
    }
    repliesToggle.addEventListener('click', () => {
      replies.hidden = !replies.hidden;
      repliesToggle.setAttribute('aria-expanded', String(!replies.hidden));
      if (replies.hidden) {
        card.stopReplies?.();
        card.stopReplies = null;
      } else {
        if (!replyName.value) replyName.value = displayName;
        listenToReplies();
      }
    });
    replyRetry.addEventListener('click', listenToReplies);
    olderRepliesButton.addEventListener('click', () => {
      if (repliesLoading) return;
      replyLimit += REPLY_BATCH;
      olderRepliesButton.textContent = 'Loading older replies…';
      listenToReplies();
    });
    replyForm.addEventListener('submit', event => {
      event.preventDefault();
      submitMessage({
        form: replyForm, input: replyInput, name: replyName, status: replyFormStatus, submit: replySubmit,
        create: (services, message) => services.addDoc(services.collection(services.db, 'pageComments', pageId, 'threads', id, 'replies'), message)
      });
    });
    return card;
  }

  function renderThreads(snapshot) {
    const documents = [...snapshot.docs].reverse();
    const ids = new Set(documents.map(doc => doc.id));
    for (const [id, card] of threadCards) {
      if (ids.has(id)) continue;
      card.stopReplies?.();
      card.element.remove();
      threadCards.delete(id);
    }
    documents.forEach((doc, index) => {
      let card = threadCards.get(doc.id);
      if (!card) {
        card = makeThread(doc.id);
        threadCards.set(doc.id, card);
      }
      const data = doc.data();
      card.data = data;
      card.quoteButton.textContent = typeof data.anchor?.exact === 'string' ? data.anchor.exact : 'Selected text';
      card.author.textContent = typeof data.name === 'string' ? data.name : 'Guest';
      card.time.textContent = dateText(data.createdAt, doc.metadata.hasPendingWrites);
      const date = data.createdAt?.toDate?.();
      if (date instanceof Date && !Number.isNaN(date.getTime())) card.time.dateTime = date.toISOString();
      card.text.textContent = typeof data.text === 'string' ? data.text : '';
      if (threadList.children[index] !== card.element) threadList.insertBefore(card.element, threadList.children[index] || null);
    });
    count.textContent = `${documents.length}${documents.length >= threadLimit ? '+' : ''}`;
    launcher.setAttribute('aria-label', `Comments on this page: ${documents.length}${documents.length >= threadLimit ? ' or more' : ''}`);
    emptyMessage.hidden = documents.length > 0;
    emptyMessage.textContent = serverConfirmed ? 'No comments yet. Highlight text to start the conversation.' : 'Connecting to comments…';
    olderThreadsButton.hidden = documents.length < threadLimit;
    olderThreadsButton.disabled = false;
    olderThreadsButton.textContent = 'Load older comments';
    limitNote.textContent = documents.length >= threadLimit ? `Showing ${documents.length} comments. Load older comments to see more.` : '';
    updateHighlights();
  }

  function updateConnection(fromCache = false) {
    if (loadError) return;
    if (!navigator.onLine) connectionText.textContent = 'Offline. Comments will reconnect when you are online.';
    else if (loading || !serverConfirmed) connectionText.textContent = 'Connecting to comments…';
    else connectionText.textContent = fromCache ? 'Reconnecting. Showing comments already loaded.' : 'Comments update live.';
  }

  async function listenToThreads() {
    const generation = ++listenerGeneration;
    stopThreads?.();
    stopThreads = null;
    loading = true;
    loadError = false;
    retryButton.hidden = true;
    updateConnection();
    try {
      const services = await getServices();
      if (generation !== listenerGeneration) return;
      const reference = services.collection(services.db, 'pageComments', pageId, 'threads');
      const query = services.query(reference, services.orderBy('createdAt', 'desc'), services.limit(threadLimit));
      stopThreads = services.onSnapshot(query, { includeMetadataChanges: true }, snapshot => {
        loading = false;
        olderThreadsButton.disabled = false;
        olderThreadsButton.textContent = 'Load older comments';
        serverConfirmed ||= !snapshot.metadata.fromCache;
        loadError = false;
        retryButton.hidden = true;
        updateConnection(snapshot.metadata.fromCache);
        renderThreads(snapshot);
      }, error => {
        console.error('Comments: listener unavailable', error?.code || 'unknown');
        loading = false;
        olderThreadsButton.disabled = false;
        olderThreadsButton.textContent = 'Load older comments';
        loadError = true;
        connectionText.textContent = 'Could not load comments. Please try again.';
        emptyMessage.hidden = threadCards.size > 0;
        if (!threadCards.size) emptyMessage.textContent = 'Comments are temporarily unavailable.';
        retryButton.hidden = false;
      });
    } catch (error) {
      if (generation !== listenerGeneration) return;
      loading = false;
      olderThreadsButton.disabled = false;
      olderThreadsButton.textContent = 'Load older comments';
      loadError = true;
      connectionText.textContent = 'Could not connect to comments. Check your connection and try again.';
      emptyMessage.hidden = threadCards.size > 0;
      if (!threadCards.size) emptyMessage.textContent = 'Comments are temporarily unavailable.';
      retryButton.hidden = false;
    }
  }

  retryButton.addEventListener('click', listenToThreads);
  olderThreadsButton.addEventListener('click', () => {
    if (loading) return;
    threadLimit += THREAD_BATCH;
    olderThreadsButton.disabled = true;
    olderThreadsButton.textContent = 'Loading older comments…';
    listenToThreads();
  });
  window.addEventListener('online', () => loadError ? listenToThreads() : updateConnection());
  window.addEventListener('offline', () => updateConnection());
  const content = document.querySelector('main');
  if (content) {
    new MutationObserver(() => updateHighlights()).observe(content, { subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
  }
  listenToThreads();
}
