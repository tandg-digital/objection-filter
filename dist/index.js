'use strict';

var FilterQueryBuilder = require('./lib/FilterQueryBuilder');

module.exports = {
  buildFilter: function buildFilter(modelClass, trx, options) {
    return new FilterQueryBuilder(modelClass, trx, options);
  },
  FilterQueryBuilder: FilterQueryBuilder,
  sliceRelation: require('./lib/utils').sliceRelation,
  createRelationExpression: require('./lib/ExpressionBuilder').createRelationExpression
};