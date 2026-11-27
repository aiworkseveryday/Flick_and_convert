// Errors that the bubble treats specially.
const tagged = (code, message) => Object.assign(new Error(message), { code });

module.exports = {
  cancelled: () => tagged('CANCELLED', 'Cancelled'),
  needPassword: () => tagged('NEED_PASSWORD', 'This file is password protected'),
  wrongPassword: () => tagged('WRONG_PASSWORD', 'Wrong password'),
  isCancelled: (e) => !!e && e.code === 'CANCELLED',
};
