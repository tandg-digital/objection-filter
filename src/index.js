const FilterQueryBuilder = require('./lib/FilterQueryBuilder');

module.exports = {
  buildFilter: function (modelClass, trx) {
    return new FilterQueryBuilder(modelClass, trx);
  },
  FilterQueryBuilder: FilterQueryBuilder,
  sliceRelation: require('./lib/utils').sliceRelation,
  createRelationExpression: require('./lib/ExpressionBuilder').createRelationExpression
};