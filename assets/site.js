/* Small, browser-only interactions for the opportunity prototype. */
(() => {
  const form = document.querySelector('.directory-tools');
  if (form) {
    const search = document.querySelector('#opportunity-search');
    const theme = document.querySelector('#theme-filter');
    const cards = [...document.querySelectorAll('.opportunity-card')].map(card => ({
      element: card,
      categories: card.dataset.categories ? JSON.parse(card.dataset.categories) : [card.dataset.group]
    }));
    const clear = form.querySelector('.clear-filters');
    const query = new URLSearchParams(location.search);
    search.value = query.get('search') || '';
    if ([...theme.options].some(option => option.value === query.get('theme'))) theme.value = query.get('theme');
    function filter(updateUrl = true) {
      const keyword = search.value.toLocaleLowerCase().trim();
      let count = 0;
      for (const { element: card, categories } of cards) {
        card.hidden = !(card.dataset.search.includes(keyword) && (!theme.value || categories.includes(theme.value)));
        if (!card.hidden) count++;
      }
      document.querySelector('#opportunity-count').textContent = count;
      document.querySelector('#filter-status').textContent = `${count} ${count === 1 ? 'opportunity' : 'opportunities'} found.`;
      document.querySelector('.empty-state').hidden = count !== 0;
      clear.hidden = !search.value && !theme.value;
      if (updateUrl) {
        const params = new URLSearchParams();
        if (search.value) params.set('search', search.value);
        if (theme.value) params.set('theme', theme.value);
        history.replaceState(null, '', location.pathname + (params.size ? '?' + params : ''));
      }
    }
    function reset() { search.value = ''; theme.value = ''; filter(); }
    form.addEventListener('submit', event => { event.preventDefault(); filter(); });
    form.addEventListener('input', () => filter());
    form.addEventListener('change', () => filter());
    form.addEventListener('reset', event => { event.preventDefault(); reset(); });
    document.querySelector('#empty-reset').addEventListener('click', () => { reset(); search.focus(); });
    filter(false);
  }

  // Native dialogs provide keyboard focus trapping and Escape-to-close support.
  // Keep the page in place while either overlay is open, then restore focus.
  let openDialogs = 0;
  let pageOverflow;
  let bodyOverflow;
  function connectDialog(dialog, triggers, beforeOpen = () => {}) {
    if (!dialog) return;
    let launcher;
    let locked = false;
    for (const trigger of triggers) {
      trigger.addEventListener('click', () => {
        if (dialog.open) return;
        beforeOpen(trigger);
        launcher = trigger;
        dialog.showModal();
        if (openDialogs === 0) {
          pageOverflow = document.documentElement.style.overflow;
          bodyOverflow = document.body.style.overflow;
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
        }
        openDialogs++;
        locked = true;
      });
    }
    for (const close of dialog.querySelectorAll('.dialog-close, .dialog-done')) {
      close.addEventListener('click', () => dialog.close());
    }
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(control => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
        dialog.close();
      }
    });
    dialog.addEventListener('close', () => {
      if (locked) {
        openDialogs--;
        locked = false;
        if (openDialogs === 0) {
          document.documentElement.style.overflow = pageOverflow;
          document.body.style.overflow = bodyOverflow;
        }
      }
      if (launcher && launcher.isConnected) launcher.focus({ preventScroll: true });
    });
  }

  connectDialog(
    document.querySelector('#information-dialog'),
    document.querySelectorAll('[data-info]'),
    trigger => {
      const title = trigger.dataset.info;
      document.querySelector('#dialog-title').textContent = title;
      document.querySelector('#dialog-message').textContent = title === 'Apply Now'
        ? trigger.dataset.timeline
          ? `The programme runs from ${trigger.dataset.timeline.replace(/\.$/, '')}. Application details will be confirmed.`
          : 'Application details will be confirmed.'
        : title === 'Contact Us'
          ? 'Programme contact details are TBC.'
          : 'This preview focuses on the opportunity directory and its detail pages. Further programme information is TBC.';
    }
  );
  connectDialog(
    document.querySelector('#market-validation-dialog'),
    document.querySelectorAll('[data-market-validation]')
  );
})();
