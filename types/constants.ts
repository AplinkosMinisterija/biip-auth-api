import Moleculer, { Errors } from 'moleculer';
import { FieldHookCallback } from './';

export function throwUnauthorizedError(message?: string, data?: any): Errors.MoleculerError {
  throw new Moleculer.Errors.MoleculerClientError(
    message || `Unauthorized.`,
    401,
    'UNAUTHORIZED',
    data,
  );
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
