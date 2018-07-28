const FilterQueryBuilder = require('./lib/FilterQueryBuilder');
const { sliceRelation } = require('./lib/utils');
const { createRelationExpression } = require('./lib/ExpressionBuilder');

module.exports = {
  buildFilter: function (modelClass, trx, options) {
    return new FilterQueryBuilder(modelClass, trx, options);
  },
  FilterQueryBuilder: FilterQueryBuilder,
  sliceRelation: sliceRelation,
  createRelationExpression: createRelationExpression
};
