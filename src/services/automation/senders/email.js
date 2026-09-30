import nodemailer from "nodemailer";

// Email sender for automations (plan 1.3). Uses the SMTP settings saved on a
// team member's login (a_application_logins: host_out_going_mail,
// port_mail_setup, mail_id_setup, password_mail_setup) - same settings the
// existing auto-assignment mail uses, but with caller-supplied subject/body.

export const hasSmtp = (user) =>
  !!(user?.host_out_going_mail && user?.port_mail_setup && user?.mail_id_setup && user?.password_mail_setup);

export const sendEmailAs = async (user, { to, cc, subject, html, attachments }) => {
  if (!hasSmtp(user)) throw new Error(`Email is not set up for user ${user?.username || user?.id || "?"}`);
  const port = Number(user.port_mail_setup);
  const transporter = nodemailer.createTransport({
    host: user.host_out_going_mail,
    port,
    secure: port === 465,
    auth: { user: user.mail_id_setup, pass: user.password_mail_setup },
  });
  const info = await transporter.sendMail({
    from: user.mail_id_setup,
    to,
    cc: cc || undefined,
    subject,
    html,
    attachments: attachments || undefined,
  });
  return { message_id: info.messageId, accepted: info.accepted, rejected: info.rejected };
};
