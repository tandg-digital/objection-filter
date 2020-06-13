import { default as _FilterQueryBuilder } from './lib/FilterQueryBuilder';
import { sliceRelation as _sliceRelation } from './lib/utils';
import { createRelationExpression as _createRelationExpression } from './lib/ExpressionBuilder';

export function buildFilter(modelClass, trx, options) {
  return new FilterQueryBuilder(modelClass, trx, options);
};
export const FilterQueryBuilder = _FilterQueryBuilder;
export const sliceRelation = _sliceRelation;
export const createRelationExpression = _createRelationExpression;