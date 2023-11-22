// const postmark = require("postmark");
import { ServerClient } from 'postmark';
import { User } from '../services/users.service';
let client: ServerClient;

if (process.env.POSTMARK_KEY) {
  client = new ServerClient(process.env.POSTMARK_KEY);
}

const sender = 'noreply@biip.lt';

export function emailCanBeSent() {
  return ['production', 'staging'].includes(process.env.NODE_ENV);
}

export function sendAdminInvitationEmail(
  email: string,
  invitationUrl: string,
  inviter: User,
  productName: string,
) {
  return client?.sendEmailWithTemplate({
    From: sender,
    To: email.toLowerCase(),
    TemplateId: 28120959,
    TemplateModel: {
      invite_sender_name: `${inviter.firstName} ${inviter.lastName}`,
      invite_sender_email: inviter.email,
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
  return client?.sendEmailWithTemplate({
    From: sender,
    To: email.toLowerCase(),
    TemplateId: isApp ? 28847502 : 28317472,
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
  return client?.sendEmailWithTemplate({
    From: sender,
    To: email.toLowerCase(),
    TemplateId: 28121641,
    TemplateModel: {
      name: user.firstName,
      user_email: user.email,
      action_url: resetUrl,
    },
  });
}
