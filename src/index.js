const FilterQueryBuilder = require('./lib/FilterQueryBuilder');

module.exports = {
  buildFilter: function (modelClass) {
    return new FilterQueryBuilder(modelClass);
  }
};