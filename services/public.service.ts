// @ts-ignore
import { Action, Service } from 'moleculer-decorators';
import moleculer, { Context } from 'moleculer';
import { readFileSync } from 'fs';

@Service({
  name: 'public',
})
export default class PublicService extends moleculer.Service {
  @Action()
  evartaiHtml(ctx: Context<null, { $responseType: string }>) {
    ctx.meta.$responseType = 'text/html';
    return readFileSync('./public/evartai.html');
  }
}
