const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

/** Send an email. Without SMTP configured, the email is printed to the console (development). */
async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`\n[mail:console] To: ${to}\nSubject: ${subject}\n${text || html.replace(/<[^>]+>/g, ' ')}\n`);
    return { console: true };
  }
  return transporter.sendMail({ from: config.smtp.from, to, subject, html, text });
}

const isConfigured = () => !!transporter;

module.exports = { sendMail, isConfigured };
