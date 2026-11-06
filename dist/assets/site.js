/* Small, browser-only interactions for the opportunity prototype. */
(() => {
  const form = document.querySelector('.directory-tools');
  if (form) {
    const search = document.querySelector('#opportunity-search');
    const theme = document.querySelector('#theme-filter');
    const cards = [...document.querySelectorAll('.opportunity-card')];
    const clear = form.querySelector('.clear-filters');
    const query = new URLSearchParams(location.search);
    search.value = query.get('search') || '';
    if ([...theme.options].some(option => option.value === query.get('theme'))) theme.value = query.get('theme');
    function filter(updateUrl = true) {
      const keyword = search.value.toLocaleLowerCase().trim();
      let count = 0;
      for (const card of cards) {
        card.hidden = !(card.dataset.search.includes(keyword) && (!theme.value || card.dataset.group === theme.value));
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

  const dialog = document.querySelector('#information-dialog');
  for (const trigger of document.querySelectorAll('[data-info]')) {
    trigger.addEventListener('click', () => {
      const title = trigger.dataset.info;
      document.querySelector('#dialog-title').textContent = title;
      document.querySelector('#dialog-message').textContent = title === 'Apply Now'
        ? 'Application details and programme dates are TBC. This preview does not collect or submit applications.'
        : title === 'Contact Us'
          ? 'Programme contact details are TBC.'
          : 'This preview focuses on the opportunity directory and its detail pages. Further programme information is TBC.';
      dialog.showModal();
    });
  }
  for (const close of dialog.querySelectorAll('.dialog-close, .dialog-done')) close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
})();
