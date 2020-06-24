import { default as _FilterQueryBuilder } from './lib/FilterQueryBuilder';
import { sliceRelation as _sliceRelation } from './lib/utils';
import { createRelationExpression as _createRelationExpression } from './lib/ExpressionBuilder';
import {
  BaseModel,
  FilterQueryBuilderOptions
} from './lib/types';
import { Transaction, Model } from 'objection';

export function buildFilter<M extends BaseModel, K extends typeof Model>(
  modelClass: K,
  trx: Transaction,
  options: FilterQueryBuilderOptions<M>
) {
  return new FilterQueryBuilder(modelClass, trx, options);
};
export const FilterQueryBuilder = _FilterQueryBuilder;
export const sliceRelation = _sliceRelation;
export const createRelationExpression = _createRelationExpression;