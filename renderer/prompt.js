const $ = (id) => document.getElementById(id);
let confirmNeeded = false;

window.flickPrompt.info().then((info) => {
  if (!info) return window.flickPrompt.done(null);
  $('title').textContent = info.title || 'Password';
  $('message').textContent = info.message || '';
  confirmNeeded = !!info.confirm;
  $('confirmRow').hidden = !confirmNeeded;
  $('pw').focus();
});

$('peek').addEventListener('click', () => {
  const show = $('pw').type === 'password';
  $('pw').type = $('pw2').type = show ? 'text' : 'password';
  $('peek').textContent = show ? 'Hide' : 'Show';
  $('pw').focus();
});

$('card').addEventListener('submit', (e) => {
  e.preventDefault();
  const pw = $('pw').value;
  if (!pw) return showError('Type a password first');
  if (confirmNeeded && pw !== $('pw2').value) return showError("The two passwords don't match");
  window.flickPrompt.done(pw);
});

$('cancel').addEventListener('click', () => window.flickPrompt.done(null));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.flickPrompt.done(null);
});

function showError(text) {
  $('error').textContent = text;
  $('pw').focus();
}
