import { ServerClient } from 'postmark';
import { User } from '../services/users.service';
let client: ServerClient;

if (process.env.POSTMARK_KEY) {
  client = new ServerClient(process.env.POSTMARK_KEY);
}

const sender = process.env.POSTMARK_SENDER || 'noreply@biip.lt';
const userInviteTemplateId = Number(process.env.POSTMARK_USER_INVITE_TEMPLATE_ID);
const evartaiInviteTemplateId = Number(process.env.POSTMARK_EVARTAI_INVITE_TEMPLATE_ID);
const evartaiInviteTemplateIdApp = Number(process.env.POSTMARK_EVARTAI_INVITE_TEMPLATE_ID_APP);
const passwordResetTemplateId = Number(process.env.POSTMARK_PASSWORD_RESET_TEMPLATE_ID);

export function emailCanBeSent() {
  return ['production', 'staging'].includes(process.env.NODE_ENV);
}

function getSender(name?: string) {
  if (!name) return sender;
  return `${name} <${sender}>`;
}

export function sendUserInvitationEmail(
  email: string,
  data: { invitationUrl: string; inviter?: User; productName?: string; senderName?: string },
) {
  if (!userInviteTemplateId) return;

  const inviterName =
    data.inviter?.firstName || data.inviter?.lastName
      ? `${data.inviter.firstName} ${data.inviter.lastName}`
      : '';

  return client?.sendEmailWithTemplate({
    From: getSender(data.senderName),
    To: email.toLowerCase(),
    TemplateId: userInviteTemplateId,
    TemplateModel: {
      invite_sender_name: inviterName,
      invite_sender_email: data.inviter?.email || '',
      action_url: data.invitationUrl,
      product_name: data.productName,
    },
  });
}

export function sendEvartaiInvitationEmail(
  email: string,
  data: {
    appUrl: string;
    appName: string;
    inviterName: string;
    inviterEmail: string;
    inviteType: string;
    isApp: boolean;
    senderName?: string;
  },
) {
  let templateId = evartaiInviteTemplateId;
  if (data.isApp && evartaiInviteTemplateIdApp) {
    templateId = evartaiInviteTemplateIdApp;
  }

  if (!templateId) return;

  return client?.sendEmailWithTemplate({
    From: getSender(data.senderName),
    To: email.toLowerCase(),
    TemplateId: templateId,
    TemplateModel: {
      invite_sender_name: data.inviterName,
      invite_sender_email: data.inviterEmail,
      invite_type: data.inviteType,
      action_url: data.appUrl,
      product_name: data.appName,
    },
  });
}

export function sendResetPasswordEmail(
  email: string,
  data: { user: User; resetUrl: string; senderName?: string },
) {
  if (!passwordResetTemplateId) return;

  return client?.sendEmailWithTemplate({
    From: getSender(data.senderName),
    To: email.toLowerCase(),
    TemplateId: passwordResetTemplateId,
    TemplateModel: {
      name: data.user.firstName,
      user_email: data.user.email,
      action_url: data.resetUrl,
    },
  });
}
