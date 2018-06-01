const _ = require('lodash');
const { debug } = require('../config');
const OR = '$or', AND = '$and';

/**
 * If the input is an object, transform it into an array of key:value pairs
 * @param {Object|Array} objectOrArray
 * @returns {Array<Object>}
 */
const arrayize = function(objectOrArray) {
  if (_.isArray(objectOrArray))
    return objectOrArray;
  else
    return _.toPairs(objectOrArray).map(item => ({ [item[0]]: item[1] }));
};

/**
 * Given a logical expression return an array of all properties
 * @param {Object} expression
 */
const getPropertiesFromExpression = function(expression = {}) {
  let properties = [];

  for (let lhs in expression) {
    const rhs = expression[lhs];

    if ([OR, AND].includes(lhs)) {
      for (let subExpression of arrayize(rhs))
        properties = properties.concat(getPropertiesFromExpression(subExpression));
    } else {
      properties.push(lhs);
    }
  }

  return properties;
};

/**
 * Heuristic:
 * 1. Start with an expression {} and iterate its keys
 * 2. Each [key] will either be a LOGICAL_OPERATOR or a PROPERTY
 * 3. If it's a LOGICAL_OPERATOR, pass back to the same function
 * 4. If it's a property, go to another function that stores this property name
 * 5. Once a property is 'hit', it is maintained for the rest of the tree nodes
 *
 * Iterates a logical expression until it hits a non-logical operator
 * Then jumps out and calls the provided handler
 * Valid logical expressions include:
 * "test" - A primitive, which will transform into an equality operator
 * { $gt: 1, $lt: 5 } - A non-logical expression, will be iterated (n=2) and the
 *                      handler called twice, once per operator/operand
 * { $or: [ ... ] } - An $or with an array of items (e.g. above)
 * { $or: { a: 1, b: 2 } } - An object,  will be 'arrayized' into an array
 * @param {Function} onExit A function to call once a non-logical operator is hit
 * @param {Function} onLiteral A function to call if the provided input is a primitive
 * @param {Function} propertyTransform
 */
const iterateLogicalExpression = function({
  onExit,
  onLiteral,
  propertyTransform = n => n
}) {
  const iterator = function(expression = {}, builder, or = false) {
    console.log('iterator', expression);

    builder[or ? 'orWhere' : 'where'](subQueryBuilder => {
      // Assume equality if the target expression is a primitive
      if (typeof expression !== 'object')
        return onLiteral(expression, subQueryBuilder);

      for (let lhs in expression) {
        const rhs = expression[lhs];
        debug(`Handling lhs[${lhs}] rhs[${JSON.stringify(rhs)}]`);

        if ([OR, AND].includes(lhs)) {
          for (let subExpression of arrayize(rhs)) {
            iterator(
              subExpression,
              subQueryBuilder,
              lhs === OR
            );
          }
        } else {
          // The lhs is either a non-logical operator or a property name
          onExit(propertyTransform(lhs), rhs, subQueryBuilder);
        }
      }
    });

    return getPropertiesFromExpression(expression);
  };

  return iterator;
};

module.exports = { iterateLogicalExpression };