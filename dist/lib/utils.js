'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/**
 * The utils helpers are a set of common helpers to be passed around during
 * filter execution. It stores all default operators, custom operators and
 * functions which directly touch these operators.
 */

var _ = require('lodash');

var _require = require('../config'),
    debug = _require.debug;

var _require2 = require('./LogicalIterator'),
    iterateLogicalExpression = _require2.iterateLogicalExpression;

/**
 * For a property "a.b.c", slice it into relationName: "a.b", "propertyName": "c" and
 * a fully qualified property "a:b.c"
 * @param {String} relatedProperty A dot notation property "a.b.c"
 * @param {String} delimiter A delimeter to use on the relation e.g. "." or ":"
 */


var sliceRelation = function sliceRelation(relatedProperty) {
  var delimiter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '.';

  var split = relatedProperty.split('.');
  var propertyName = split[split.length - 1];
  var relationName = split.slice(0, split.length - 1).join(delimiter);

  // Nested relations need to be in the format a:b:c.name
  // https://github.com/Vincit/objection.js/issues/363
  var fullyQualifiedProperty = relationName ? relationName.replace(/\./g, ':') + '.' + propertyName : propertyName;

  return {
    propertyName: propertyName,
    relationName: relationName,
    fullyQualifiedProperty: fullyQualifiedProperty
  };
};
module.exports.sliceRelation = sliceRelation;

/**
 * Create operation application utilities with some custom options
 * If options.operators is specified
 * @param {Object} options.operators
 */
module.exports.Operations = function (options) {
  var defaultOperators = {
    $like: function $like(property, operand, builder) {
      return builder.where(property, 'ilike', '%' + operand + '%');
    },
    $ilike: function $ilike(property, operand, builder) {
      return builder.where(property, 'ilike', '%' + operand + '%');
    },
    $lt: function $lt(property, operand, builder) {
      return builder.where(property, '<', operand);
    },
    $gt: function $gt(property, operand, builder) {
      return builder.where(property, '>', operand);
    },
    $lte: function $lte(property, operand, builder) {
      return builder.where(property, '<=', operand);
    },
    $gte: function $gte(property, operand, builder) {
      return builder.where(property, '>=', operand);
    },
    $equals: function $equals(property, operand, builder) {
      return builder.where(property, operand);
    },
    '=': function _(property, operand, builder) {
      return builder.where(property, operand);
    },
    $in: function $in(property, operand, builder) {
      return builder.where(property, 'in', operand);
    },
    $exists: function $exists(property, operand, builder) {
      return operand ? builder.whereNotNull(property) : builder.whereNull(property);
    },
    $containAll: function $containAll(property, operand, builder) {
      return builder.whereRaw('?? @> ?', [property, operand]);
    },
    /**
     * @param {String} property
     * @param {Array} items Must be an array of objects/values
     * @param {QueryBuilder} builder
     */
    $or: function $or(property, items, builder) {
      var onExit = function onExit(operator, value, subQueryBuilder) {
        var operationHandler = allOperators[operator];
        operationHandler(property, value, subQueryBuilder);
      };
      var onLiteral = function onLiteral(value, subQueryBuilder) {
        onExit('$equals', value, subQueryBuilder);
      };

      // Iterate the logical expression until it hits an operation e.g. $gte
      var iterateLogical = iterateLogicalExpression({
        onExit: onExit,
        onLiteral: onLiteral
      });

      // Wrap within another builder context to prevent end-of-expression errors
      // TODO: Investigate the consequences of not using this wrapper
      return builder.where(function (subQueryBuilder) {
        iterateLogical({
          $or: items
        }, subQueryBuilder, true);
      });
    },
    $and: function $and(property, items, builder) {
      var onExit = function onExit(operator, value, subQueryBuilder) {
        var operationHandler = allOperators[operator];
        operationHandler(property, value, subQueryBuilder);
      };
      var onLiteral = function onLiteral(value, subQueryBuilder) {
        onExit('$equals', value, subQueryBuilder);
      };

      // Iterate the logical expression until it hits an operation e.g. $gte
      var iterateLogical = iterateLogicalExpression({
        onExit: onExit,
        onLiteral: onLiteral
      });

      // Wrap within another builder context to prevent end-of-expression errors
      return builder.where(function (subQueryBuilder) {
        iterateLogical({
          $and: items
        }, subQueryBuilder, false);
      });
    }
  };
  var operators = options.operators;

  // Custom operators take override default operators

  var allOperators = Object.assign({}, defaultOperators, operators);

  /**
   * Apply a subset of operators on a single property
   * @param {String} propertyName
   * @param {Object} expression
   * @param {QueryBuilder} builder
   */
  var applyPropertyExpression = function applyPropertyExpression(propertyName, expression, builder) {
    debug('Handling property[' + propertyName + '] expression[' + JSON.stringify(expression) + ']');

    // If the rhs is a primitive, assume equality
    if ((typeof expression === 'undefined' ? 'undefined' : _typeof(expression)) !== 'object') return allOperators.$equals(propertyName, expression, builder);

    for (var lhs in expression) {
      var operationHandler = allOperators[lhs];
      var rhs = expression[lhs];

      if (!operationHandler) {
        debug('The operator [' + lhs + '] does not exist, skipping');
        continue;
      }

      operationHandler(propertyName, rhs, builder);
    }
  };

  return {
    applyPropertyExpression: applyPropertyExpression
  };
};