// Small enhancements. Everything on the page still works without them.

// Times are written in UTC; show them in the reader's own time zone.
const zoneName = (date) =>
  new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date).find((part) => part.type === 'timeZoneName')
    ?.value ?? '';
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const formats = {
  datetime: (date) => `${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} ${zoneName(date)}`,
  date: (date) => date.toLocaleDateString(undefined, { dateStyle: 'medium' }),
  relative: (date) => {
    const minutes = Math.round((date - Date.now()) / 60_000);
    if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 48) return relative.format(hours, 'hour');
    return relative.format(Math.round(hours / 24), 'day');
  },
};
for (const element of document.querySelectorAll('time[data-format]')) {
  const date = new Date(element.dateTime);
  const format = formats[element.dataset.format];
  if (!format || Number.isNaN(date.getTime())) continue;
  if (element.dataset.format === 'relative') element.title = formats.datetime(date);
  element.textContent = format(date);
}

// The hourly check saves at least once a day. Much longer than that means it stopped running.
const stale = document.getElementById('stale');
if (stale && Date.now() - Date.parse(stale.dataset.lastCheck) > 36 * 3_600_000) stale.hidden = false;

// Tooltips for the uptime bars, on hover or tap.
const tip = document.createElement('div');
tip.className = 'tip';
tip.hidden = true;
document.body.append(tip);
let shown = null;

function show(bar) {
  shown = bar;
  tip.textContent = bar.dataset.tip;
  tip.hidden = false;
  const box = bar.getBoundingClientRect();
  const width = tip.offsetWidth;
  const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), document.documentElement.clientWidth - width - 8);
  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${box.top + window.scrollY - tip.offsetHeight - 8}px`;
}

function hide() {
  shown = null;
  tip.hidden = true;
}

document.addEventListener('pointerover', (event) => {
  const bar = event.target.closest('.bar[data-tip]');
  if (bar) show(bar);
  else if (shown && event.pointerType === 'mouse') hide();
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.bar[data-tip]')) hide();
});
window.addEventListener('scroll', hide, { passive: true });
window.addEventListener('resize', hide);

// Copy buttons for the feed addresses.
for (const button of document.querySelectorAll('button[data-copy]')) {
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
    } catch {
      // No clipboard access: select the address instead, so copying it is one shortcut away.
      getSelection().selectAllChildren(button.parentElement.querySelector('code'));
      button.textContent = 'Selected';
    }
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 2000);
  });
}

// History filters: show one group at a time.
const filters = document.querySelector('.filters');
if (filters) {
  filters.hidden = false;
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    const group = button.dataset.filter;
    for (const other of filters.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button));
    for (const month of document.querySelectorAll('.month')) {
      let visible = 0;
      for (const entry of month.querySelectorAll('.entry')) {
        entry.hidden = group !== 'all' && !entry.dataset.groups.split(' ').includes(group);
        if (!entry.hidden) visible++;
      }
      month.querySelector('.empty').hidden = visible > 0;
    }
  });
}
