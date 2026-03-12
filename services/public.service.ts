// @ts-ignore
import { readFileSync } from 'fs';
import moleculer, { Context } from 'moleculer';
import { Action, Service } from 'moleculer-decorators';
import { EndpointType } from '../types';

@Service({
  name: 'public',
})
export default class PublicService extends moleculer.Service {
  @Action()
  evartaiHtml(ctx: Context<null, { $responseType: string }>) {
    ctx.meta.$responseType = 'text/html';
    return readFileSync('./public/evartai.html');
  }

  @Action({
    rest: {
      method: 'GET',
      basePath: '',
      path: '/htmlEnv',
    },
    auth: EndpointType.PUBLIC,
  })
  getHtmlEnv() {
    const env = process.env;
    return {
      HTML_LOGO_URL: env.HTML_LOGO_URL,
      HTML_LOGO_ICON_URL: env.HTML_LOGO_ICON_URL,
      HTML_SUBTITLE: env.HTML_SUBTITLE,
    };
  }
}
