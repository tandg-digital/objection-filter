const FilterQueryBuilder = require('./lib/FilterQueryBuilder');

module.exports = {
  buildFilter: function (modelClass) {
    return new FilterQueryBuilder(modelClass);
  },
  FilterQueryBuilder: FilterQueryBuilder,
  sliceRelation: require('./lib/utils').sliceRelation,
  createRelationExpression: require('./lib/ExpressionBuilder').createRelationExpression
};