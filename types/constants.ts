import Moleculer, { Errors } from 'moleculer';
import { FieldHookCallback } from './';

export enum EndpointType {
  ADMIN = 'ADMIN',
  USER = 'USER',
  SUPER_ADMIN = 'SUPER_ADMIN',
  PUBLIC = 'PUBLIC',
  // A trusted service presenting a valid app API key (X-API-Key). Reachable only
  // service-to-service (a browser never holds an app key), so it widens a gate
  // for backend callers without exposing the endpoint to the public web.
  APP = 'APP',
}

// Admin/super-admin local passwords must be rotated at least this often.
export const PASSWORD_MAX_AGE_DAYS = 90;

export function throwUnauthorizedError(message?: string, data?: any): Errors.MoleculerError {
  throw new Moleculer.Errors.MoleculerClientError(
    message || `Unauthorized.`,
    401,
    'UNAUTHORIZED',
    data,
  );
}
export function throwNoTokenError(data?: any): Errors.MoleculerError {
  throw new Moleculer.Errors.MoleculerClientError('Unauthorized', 401, 'NO_TOKEN', data);
}
export function throwValidationError(message?: string, data?: any): Errors.MoleculerError {
  throw new Moleculer.Errors.MoleculerClientError(
    message || `ValidationError`,
    422,
    'VALIDATION_ERROR',
    data,
  );
}

export function throwBadRequestError(message?: string, data?: any): Errors.MoleculerError {
  throw new Moleculer.Errors.MoleculerServerError(
    message || `Bad request.`,
    400,
    'BAD_REQUEST',
    data,
  );
}

export function throwNotFoundError(message?: string, data?: any): Errors.MoleculerError {
  throw new Moleculer.Errors.MoleculerServerError(message || `Not found.`, 404, 'NOT_FOUND', data);
}

export const COMMON_FIELDS = {
  createdBy: {
    type: 'string',
    readonly: true,
    populate: 'users.resolve',
    onCreate: ({ ctx }: FieldHookCallback) => ctx.meta.user?.id,
  },

  createdAt: {
    type: 'date',
    columnType: 'datetime',
    readonly: true,
    onCreate: () => new Date(),
  },

  updatedBy: {
    type: 'string',
    readonly: true,
    populate: 'users.resolve',
    onUpdate: ({ ctx }: FieldHookCallback) => ctx.meta.user?.id,
  },

  updatedAt: {
    type: 'date',
    columnType: 'datetime',
    readonly: true,
    onUpdate: () => new Date(),
  },

  deletedBy: {
    type: 'string',
    readonly: true,
    hidden: 'byDefault',
    populate: 'users.resolve',
    onRemove: ({ ctx }: FieldHookCallback) => ctx.meta.user?.id,
  },

  deletedAt: {
    type: 'date',
    columnType: 'datetime',
    readonly: true,
    hidden: 'byDefault',
    onRemove: () => new Date(),
  },
};

export const COMMON_SCOPES = {
  notDeleted: {
    deletedAt: { $exists: false },
  },
};

export interface BaseModelInterface {
  id?: number;
  createdAt?: Date;
  createdBy?: string;
  updatedAt?: Date;
  updatedBy?: string;
  deletedAt?: Date;
  deletedBy?: string;
}

export const COMMON_DEFAULT_SCOPES = ['notDeleted'];

export const DISABLE_REST_ACTIONS = {
  count: {
    rest: null as any,
  },
  find: {
    rest: null as any,
  },
  replace: {
    rest: null as any,
  },
};
