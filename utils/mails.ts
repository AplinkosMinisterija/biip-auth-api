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

export function sendUserInvitationEmail(
  email: string,
  invitationUrl: string,
  inviter?: User,
  productName?: string,
) {
  if (!userInviteTemplateId) return;

  const inviterName =
    inviter?.firstName || inviter?.lastName ? `${inviter.firstName} ${inviter.lastName}` : '';

  return client?.sendEmailWithTemplate({
    From: sender,
    To: email.toLowerCase(),
    TemplateId: userInviteTemplateId,
    TemplateModel: {
      invite_sender_name: inviterName,
      invite_sender_email: inviter?.email || '',
      action_url: invitationUrl,
      product_name: productName,
    },
  });
}

export function sendEvartaiInvitationEmail(
  email: string,
  appUrl: string,
  appName: string,
  inviterName: string,
  inviterEmail: string,
  inviteType: string,
  isApp: boolean = false,
) {
  let templateId = evartaiInviteTemplateId;
  if (isApp && evartaiInviteTemplateIdApp) {
    templateId = evartaiInviteTemplateIdApp;
  }

  if (!templateId) return;

  return client?.sendEmailWithTemplate({
    From: sender,
    To: email.toLowerCase(),
    TemplateId: templateId,
    TemplateModel: {
      invite_sender_name: inviterName,
      invite_sender_email: inviterEmail,
      invite_type: inviteType,
      action_url: appUrl,
      product_name: appName,
    },
  });
}

export function sendResetPasswordEmail(email: string, user: User, resetUrl: string) {
  if (!passwordResetTemplateId) return;

  return client?.sendEmailWithTemplate({
    From: sender,
    To: email.toLowerCase(),
    TemplateId: passwordResetTemplateId,
    TemplateModel: {
      name: user.firstName,
      user_email: user.email,
      action_url: resetUrl,
    },
  });
}
