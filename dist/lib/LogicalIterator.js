'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var _ = require('lodash');

var _require = require('../config'),
    debug = _require.debug;

var OR = '$or',
    AND = '$and';

/**
 * If the input is an object, transform it into an array of key:value pairs
 * { a: 1, b: 2 } becomes [{ a: 1 }, { b: 2}]
 * [{ a: 1 }, { b: 2}] is unchanged
 * @param {Object|Array} objectOrArray
 * @returns {Array<Object>}
 */
var arrayize = function arrayize(objectOrArray) {
  if (_.isArray(objectOrArray)) return objectOrArray;else return _.toPairs(objectOrArray).map(function (item) {
    return _defineProperty({}, item[0], item[1]);
  });
};

/**
 * Given a logical expression return an array of all properties
 * @param {Object} expression
 * @param {Function} test A function to determine whether to include the property
 */
var getPropertiesFromExpression = function getPropertiesFromExpression() {
  var expression = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var test = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : function () {
    return true;
  };

  var properties = [];

  for (var lhs in expression) {
    var rhs = expression[lhs];

    if ([OR, AND].includes(lhs)) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = arrayize(rhs)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var subExpression = _step.value;

          properties = properties.concat(getPropertiesFromExpression(subExpression, test));
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    } else {
      if (test(lhs)) properties.push(lhs);
    }
  }

  return _.uniq(properties);
};

/**
 * Returns a function which iterates an object composed of $or/$and operators
 * Values of $or/$and operators can be either objects or arrays
 * e.g. { $or: [...] }, { $or: { ... } }
 * If the input to the iterator is a primitive, e.g. { $or: [1,2,3] }
 * then the onLiteral callback will be called with (1), (2) and (3)
 * If the input is a non-logical operator e.g. { $or: [ { count: 5 } ] }
 * then the onExit callback will be called with ('count', 5)
 *
 * Valid logical expressions include:
 * { $gt: 1, $lt: 5 } - A non-logical expression, will be iterated (n=2) and
 *                      onExit called twice, once per operator/operand
 * { $or: [ ... ] } - An $or with an array of items (e.g. above)
 * { $or: { a: 1, b: 2 } } - An object,  will be 'arrayized' into an array
 * @param {Function} onExit A function to call once a non-logical operator is hit
 * @param {Function} onLiteral A function to call if the provided input is a primitive
 */
var iterateLogicalExpression = function iterateLogicalExpression(_ref2) {
  var onExit = _ref2.onExit,
      onLiteral = _ref2.onLiteral;

  /**
   *
   * @param {Object} expression
   * @param {ObjecQueryBuilder} builder
   * @param {Boolean} or
   * @param {Function} propertyTransform A preOnExit transform for the property name
   */
  var iterator = function iterator(expression, builder) {
    var or = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
    var propertyTransform = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : function (p) {
      return p;
    };

    debug('Iterating through', expression);

    builder[or ? 'orWhere' : 'where'](function (subQueryBuilder) {
      // Assume equality if the target expression is a primitive
      if ((typeof expression === 'undefined' ? 'undefined' : _typeof(expression)) !== 'object') return onLiteral(expression, subQueryBuilder);

      var _loop = function _loop(lhs) {
        var rhs = expression[lhs];
        debug('Handling lhs[' + lhs + '] rhs[' + JSON.stringify(rhs) + ']');

        if ([OR, AND].includes(lhs)) {
          // Wrap nested conditions in their own scope
          subQueryBuilder.where(function (innerBuilder) {
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
              for (var _iterator2 = arrayize(rhs)[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var subExpression = _step2.value;

                iterator(subExpression, innerBuilder, lhs === OR, propertyTransform);
              }
            } catch (err) {
              _didIteratorError2 = true;
              _iteratorError2 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion2 && _iterator2.return) {
                  _iterator2.return();
                }
              } finally {
                if (_didIteratorError2) {
                  throw _iteratorError2;
                }
              }
            }
          });
        } else {
          // The lhs is either a non-logical operator or a property name
          onExit(propertyTransform(lhs), rhs, subQueryBuilder);
        }
      };

      for (var lhs in expression) {
        _loop(lhs);
      }
    });
  };

  return iterator;
};

module.exports = { iterateLogicalExpression: iterateLogicalExpression, getPropertiesFromExpression: getPropertiesFromExpression };