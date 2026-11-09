import nodemailer from 'nodemailer';

const mailConfig = {
  host: String(process.env.SMTP_HOST || '').trim(),
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE !== 'false',
  user: String(process.env.SMTP_USER || '').trim(),
  pass: String(process.env.SMTP_PASS || ''),
  from: String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim(),
};

let transporter = null;

export function isMailConfigured() {
  return Boolean(mailConfig.host && mailConfig.user && mailConfig.pass && mailConfig.from);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth: { user: mailConfig.user, pass: mailConfig.pass },
    });
  }
  return transporter;
}

export async function sendResetCode(email, code) {
  if (!isMailConfigured()) return false;

  await getTransporter().sendMail({
    from: mailConfig.from,
    to: email,
    subject: '白马AI 密码重置验证码',
    text: `你的密码重置验证码是：${code}\n10 分钟内有效。如果这不是你本人操作，请忽略此邮件。`,
    html: `
      <p>你的密码重置验证码是：</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
      <p>10 分钟内有效。如果这不是你本人操作，请忽略此邮件。</p>
    `,
  });

  return true;
}
