import moleculer from 'moleculer';
import { Service } from 'moleculer-decorators';
const Openapi = require('moleculer-auto-openapi');

@Service({
  name: 'openapi',
  mixins: [Openapi],
  settings: {
    // all setting optional
    openapi: {
      info: {
        // about project
        description: 'Foo',
        title: 'Bar',
      },
      tags: [
        // you tags
        { name: 'auth', description: 'My custom name' },
      ],
      components: {
        // you auth
        securitySchemes: {
          myBasicAuth: {
            type: 'http',
            scheme: 'basic',
          },
        },
      },
    },
  },
})
export default class OpenApiService extends moleculer.Service {}
