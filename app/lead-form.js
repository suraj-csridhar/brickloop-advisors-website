const form = document.querySelector('#bl-contact form');
const status = form.querySelector('.form-status');
const button = form.querySelector('button[type="submit"]');
let pending = false;
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (pending || !form.reportValidity()) return;
  pending = true;
  button.disabled = true;
  button.textContent = 'Sending…';
  form.setAttribute('aria-busy', 'true');
  status.textContent = 'Sending your enquiry…';
  const payload = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error || 'We could not confirm your enquiry. Please contact us directly.');
    status.textContent = 'Your callback request has been received.';
    form.reset();
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' || error instanceof TypeError
      ? 'We could not confirm delivery. Your enquiry may have reached us. Please call or WhatsApp before resubmitting.'
      : error.message;
  } finally {
    pending = false;
    button.disabled = false;
    button.textContent = 'Request a callback ↗';
    form.removeAttribute('aria-busy');
  }
});
