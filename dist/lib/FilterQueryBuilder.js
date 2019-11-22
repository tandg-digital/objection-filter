'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * A wrapper around the objection.js model class
 * For 'where' you cannot have combinations of properties in a single AND condition
 * e.g.
 * {
 *   $and: {
 *     'a.b.c': 1,
 *     'b.e': 2
 *   },
 *   $or: [
 *      {}
 *   ]
 * }
 *
 * However, for 'require' conditions, this might be possible since ALL variables exist
 * in the same scope, since there's a join
 */

var _ = require('lodash');

var _require = require('../config'),
    debug = _require.debug;

var _require2 = require('./utils'),
    sliceRelation = _require2.sliceRelation,
    Operations = _require2.Operations;

var _require3 = require('./ExpressionBuilder'),
    createRelationExpression = _require3.createRelationExpression;

var _require4 = require('./LogicalIterator'),
    iterateLogicalExpression = _require4.iterateLogicalExpression,
    getPropertiesFromExpression = _require4.getPropertiesFromExpression;

var baseFields = ['id', 'createdAt', 'updatedAt'];

module.exports = function () {
  /**
   * @param {Model} Model
   * @param {Transaction} trx
   * @param {Object} options.operators Custom operator handlers
   */
  function FilterQueryBuilder(Model, trx) {
    var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    _classCallCheck(this, FilterQueryBuilder);

    this.Model = Model;
    this._builder = Model.query(trx);

    // Initialize custom operators
    var _options$operators = options.operators,
        operators = _options$operators === undefined ? {} : _options$operators;

    // Initialize instance specific utilities

    this.utils = Operations({
      operators: operators
    });
  }

  _createClass(FilterQueryBuilder, [{
    key: 'build',
    value: function build() {
      var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var baseModel = arguments[1];
      var fields = params.fields,
          limit = params.limit,
          offset = params.offset,
          orderBy = params.orderBy,
          includes = params.includes,
          filter = params.filter,
          page = params.page,
          perPage = params.perPage;


      applyFields(fields, this._builder);
      applyWhere(filter || {}, this._builder, this.utils, baseModel);
      applyRequire(params.require, this._builder, this.utils);
      applyOrder(orderBy, this._builder, baseModel);

      // Clone the query before adding pagination functions in case of counting
      // this.countQuery = this._builder.clone();
      if (includes) {
        applyEager(includes, this._builder, this.utils);
      }
      applyLimit(limit, offset, page, perPage, this._builder);

      return this._builder;
    }
  }, {
    key: 'count',
    value: function count() {
      var query = this.countQuery.count('* AS count').first();

      return query.then(function (result) {
        return result.count;
      });
    }

    /**
     * @param {String} exp The objection.js eager expression
     */

  }, {
    key: 'allowEager',
    value: function allowEager(eagerExpression) {
      this._builder.allowEager(eagerExpression);

      return this;
    }
  }]);

  return FilterQueryBuilder;
}();

/**
 * Apply an object notation eager object with scope based filtering
 * @param {Object} expression
 * @param {QueryBuilder} builder
 * @param {Array<string>} path An array of the current relation
 * @param {Object} utils
 */
var applyEagerFilter = function applyEagerFilter() {
  var expression = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var builder = arguments[1];
  var path = arguments[2];
  var utils = arguments[3];

  debug('applyEagerFilter(', {
    expression: expression,
    path: path
  }, ')');

  // Apply a where on the root model
  if (expression.$where) {
    var filterCopy = Object.assign({}, expression.$where);
    applyRequire(filterCopy, builder, utils);
    delete expression.$where;
  }

  // Walk the eager tree
  for (var lhs in expression) {
    var rhs = expression[lhs];
    debug('Eager Filter lhs[' + lhs + '] rhs[' + JSON.stringify(rhs) + ']');

    if (typeof rhs === 'boolean' || typeof rhs === 'string') continue;

    // rhs is an object
    var eagerName = rhs.$relation ? rhs.$relation + ' as ' + lhs : lhs;

    // including aliases e.g. "a as b.c as d"
    var newPath = path.concat(eagerName);
    var relationExpression = newPath.join('.');

    if (rhs.$where) {
      (function () {
        debug('modifyEager(', {
          relationExpression: relationExpression,
          filter: rhs.$where
        }, ')');
        var filterCopy = Object.assign({}, rhs.$where);

        // TODO: Could potentially apply all 'modifyEagers' at the end
        builder.modifyEager(relationExpression, function (subQueryBuilder) {
          applyRequire(filterCopy, subQueryBuilder, utils);
        });

        delete rhs.$where;

        expression[lhs] = rhs;
      })();
    }

    if (Object.keys(rhs).length > 0) applyEagerFilter(rhs, builder, newPath, utils);
  }

  return expression;
};

var applyEagerObject = function applyEagerObject(expression, builder, utils) {
  var expressionWithoutFilters = applyEagerFilter(expression, builder, [], utils);
  builder.eager(expressionWithoutFilters);
};

var applyEager = function applyEager(eager, builder, utils) {
  if ((typeof eager === 'undefined' ? 'undefined' : _typeof(eager)) === 'object') return applyEagerObject(eager, builder, utils);
  if (typeof eager === 'string') builder.eager('[' + eager + ']');
};
module.exports.applyEager = applyEager;

/**
 * Test if a property is a related property
 * e.g. "name" => false, "movies.name" => true
 * @param {String} name
 */
var isRelatedProperty = function isRelatedProperty(name) {
  return !!sliceRelation(name).relationName;
};

/**
 * Apply an entire require expression to the query builder
 * e.g. { "prop1": { "$like": "A" }, "prop2": { "$in": [1] } }
 * Do a first pass on the fields to create an objectionjs RelationExpression
 * This prevents joining tables multiple times, and optimizes number of joins
 * @param {Object} filter
 * @param {QueryBuilder} builder The root query builder
 */
var applyRequire = function applyRequire() {
  var filter = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var builder = arguments[1];
  var utils = arguments[2];
  var applyPropertyExpression = utils.applyPropertyExpression;

  // If there are no properties at all, just return

  var propertiesSet = getPropertiesFromExpression(filter);
  if (propertiesSet.length === 0) return builder;

  var applyLogicalExpression = iterateLogicalExpression({
    onExit: function onExit(propertyName, value, builder) {
      applyPropertyExpression(propertyName, value, builder);
    },
    onLiteral: function onLiteral() {
      throw new Error('Filter is invalid');
    }
  });
  var getFullyQualifiedName = function getFullyQualifiedName(name) {
    return sliceRelation(name).fullyQualifiedProperty;
  };

  var Model = builder.modelClass();
  var idColumns = _.isArray(Model.idColumn) ? Model.idColumn : [Model.idColumn];
  var fullIdColumns = idColumns.map(function (idColumn) {
    return Model.tableName + '.' + idColumn;
  });

  // If there are no related properties, don't join
  var relatedPropertiesSet = propertiesSet.filter(isRelatedProperty);
  if (relatedPropertiesSet.length === 0) {
    applyLogicalExpression(filter, builder, false, getFullyQualifiedName);
  } else {
    var _Model$query;

    var filterQuery = (_Model$query = Model.query()).distinct.apply(_Model$query, _toConsumableArray(fullIdColumns));

    applyLogicalExpression(filter, filterQuery, false, getFullyQualifiedName);

    // If there were related properties, join onto the filter
    var joinRelation = createRelationExpression(propertiesSet);
    if (joinRelation) filterQuery.joinRelation(joinRelation);

    var filterQueryAlias = 'filter_query';
    builder.innerJoin(filterQuery.as(filterQueryAlias), function () {
      var _this = this;

      fullIdColumns.forEach(function (fullIdColumn, index) {
        _this.on(fullIdColumn, '=', filterQueryAlias + '.' + idColumns[index]);
      });
    });
  }

  return builder;
};
module.exports.applyRequire = applyRequire;

/**
 * Apply an entire where expression to the query builder
 * e.g. { "prop1": { "$like": "A" }, "prop2": { "$in": [1] } }
 * For now it only supports a single operation for each property
 * but in reality, it should allow an AND of multiple operations
 * @param {Object} filter The filter object
 * @param {QueryBuilder} builder The root query builder
 */
var applyWhere = function applyWhere() {
  var filter = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var builder = arguments[1];
  var utils = arguments[2];
  var baseModel = arguments[3];
  var applyPropertyExpression = utils.applyPropertyExpression;

  var Model = builder.modelClass();

  _.forEach(filter, function (andExpression, property) {
    var _sliceRelation = sliceRelation(property),
        relationName = _sliceRelation.relationName,
        propertyName = _sliceRelation.propertyName;

    if (!relationName) {
      // Root level where should include the root table name
      var fullyQualifiedProperty = _.includes(baseFields, propertyName) ? (baseModel || Model.tableName) + '.' + propertyName : propertyName;
      return applyPropertyExpression(fullyQualifiedProperty, andExpression, builder);
    }

    if (relationName) {
      // Root level where should include the root table name
      var _fullyQualifiedProperty = (relationName || Model.tableName) + '.' + propertyName;
      return applyPropertyExpression(_fullyQualifiedProperty, andExpression, builder);
    }

    // Eager query fields should include the eager model table name
    builder.modifyEager(relationName, function (eagerBuilder) {
      var fullyQualifiedProperty = eagerBuilder.modelClass().tableName + '.' + propertyName;
      applyPropertyExpression(fullyQualifiedProperty, andExpression, eagerBuilder);
    });
  });

  return builder;
};
module.exports.applyWhere = applyWhere;

/**
 * Order the result by a root model field or order related models
 * Related properties are ordered locally (within the subquery) and not globally
 * e.g. order = "name desc, city.country.name asc"
 * @param {String} order An comma delimited order expression
 * @param {QueryBuilder} builder The root query builder
 */
var applyOrder = function applyOrder(order, builder, baseModel) {
  if (!order) return;
  var Model = builder.modelClass();

  order.split(',').forEach(function (orderStatement) {
    var orderProperty = orderStatement;
    var direction = 'asc';
    var isStartWithNegative = orderStatement.startsWith('-');
    if (isStartWithNegative) {
      direction = 'desc';
      orderProperty = orderProperty.substring(1);
    }

    var _sliceRelation2 = sliceRelation(orderProperty),
        propertyName = _sliceRelation2.propertyName,
        relationName = _sliceRelation2.relationName;

    if (!relationName) {
      // Root level where should include the root table name
      var fullyQualifiedColumn = _.includes(baseFields, propertyName) ? (baseModel || Model.tableName) + '.' + propertyName : propertyName;
      return builder.orderBy(fullyQualifiedColumn, direction);
    }

    if (relationName) {
      // Root level where should include the root table name
      var _fullyQualifiedColumn = (relationName || Model.tableName) + '.' + propertyName;
      return builder.orderBy(_fullyQualifiedColumn, direction);
    }

    // For now, only allow sub-query ordering of eager expressions
    builder.modifyEager(relationName, function (eagerBuilder) {
      var fullyQualifiedColumn = '' + propertyName;
      eagerBuilder.orderBy(fullyQualifiedColumn, direction);
    });
  });

  return builder;
};
module.exports.applyOrder = applyOrder;

/**
 * Based on a relation name, select a subset of fields. Do nothing if there are no fields
 * @param {Builder} builder An instance of a knex builder
 * @param {Array<String>} fields A list of fields to select
 */
var selectFields = function selectFields() {
  var fields = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
  var builder = arguments[1];
  var relationName = arguments[2];

  if (fields.length === 0) return;

  if (!relationName) return builder.select(fields);

  builder.modifyEager(relationName, function (eagerQueryBuilder) {
    eagerQueryBuilder.select(fields.map(function (field) {
      return eagerQueryBuilder.modelClass().tableName + '.' + field;
    }));
  });
};

/**
 * Select a limited set of fields. Use dot notation to limit eagerly loaded models.
 * @param {Array<String>} fields An array of dot notation fields
 * @param {QueryBuilder} builder The root query builder
 */
var applyFields = function applyFields() {
  var fields = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
  var builder = arguments[1];

  var Model = builder.modelClass();

  // Group fields by relation e.g. ["a.b.name", "a.b.id"] => {"a.b": ["name", "id"]}
  var rootFields = []; // Fields on the root model
  var fieldsByRelation = fields.reduce(function (obj, fieldName) {
    var _sliceRelation3 = sliceRelation(fieldName),
        propertyName = _sliceRelation3.propertyName,
        relationName = _sliceRelation3.relationName;

    if (!relationName) {
      rootFields.push(Model.tableName + '.' + propertyName);
    } else {
      // Push it into an array keyed by relationName
      obj[relationName] = obj[relationName] || [];
      obj[relationName].push(propertyName);
    }
    return obj;
  }, {});

  // Root fields
  selectFields(rootFields, builder);

  // Related fields
  _.map(fieldsByRelation, function (fields, relationName) {
    return selectFields(fields, builder, relationName);
  });

  return builder;
};
module.exports.applyFields = applyFields;

var applyLimit = function applyLimit(limit, offset, page, perPage, builder) {
  if (page && perPage) {
    builder.page(page - 1, perPage);
    return builder;
  }
  if (typeof limit === 'number' && typeof offset === 'number') {
    builder.page(parseInt(offset / limit), limit);
    return builder;
  }
  if (limit) builder.limit(limit);
  if (offset) builder.offset(offset);

  return builder;
};
module.exports.applyLimit = applyLimit;