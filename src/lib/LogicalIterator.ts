const OR = "$or";
const AND = "$and";
import { isArray, toPairs, uniq } from "lodash";
import { debug } from "../config";

// Types
import { Model } from "objection";
import {
  Expression,
  ExpressionValue,
  PropertyOmissionPredicate,
  ExpressionObject,
  LogicalExpressionIteratorOptions,
} from "./types";

// Typescript type predicate check during runtime
// https://stackoverflow.com/questions/12789231/class-type-check-in-typescript
function _isArray<T>(objectOrArray: Object | T[]): objectOrArray is T[] {
  return isArray(objectOrArray);
}

/**
 * If the input is an object, transform it into an array of key:value pairs
 * { a: 1, b: 2 } becomes [{ a: 1 }, { b: 2}]
 * [{ a: 1 }, { b: 2}] is unchanged
 * @param {Object|Array} objectOrArray
 * @returns {Array<Object>}
 */
function arrayize<Item>(objectOrArray: Object | Item[]): Item[] {
  if (_isArray(objectOrArray)) return objectOrArray;
  const tuples = toPairs(objectOrArray);
  const objectArray = tuples.map((item) => ({ [item[0]]: item[1] }));
  return objectArray as Item[];
}

// Helper function to confirm the rhs Expression is an object of SubExpressions
function hasSubExpression(
  lhs: string,
  rhs: ExpressionValue
): rhs is ExpressionObject {
  return [OR, AND].includes(lhs);
}

/**
 * Given a logical expression return an array of all properties
 * @param {Object} expression
 * @param {Function} test A function to determine whether to include the property
 */
export function getPropertiesFromExpression(
  expression: Expression,
  test: PropertyOmissionPredicate = () => true
): string[] {
  let properties: string[] = [];

  for (const lhs in expression as ExpressionObject) {
    const rhs = expression[lhs];

    if (hasSubExpression(lhs, rhs)) {
      for (const subExpression of arrayize(rhs)) {
        properties = properties.concat(
          getPropertiesFromExpression(subExpression, test)
        );
      }
    } else {
      if (test(lhs)) properties.push(lhs);
      continue;
    }
  }

  return uniq(properties);
}

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
export function iterateLogicalExpression<M extends Model>({
  onExit, // onExit(propertyOrOperator, value, builder)
  onLiteral, // onLiteral(value, builder)
}: LogicalExpressionIteratorOptions<M>) {
  /**
   *
   * @param {Object} expression
   * @param {ObjecQueryBuilder} builder
   * @param {Boolean} or
   * @param {Function} propertyTransform A preOnExit transform for the property name
   */
  const iterator = function <M>(
    expression: Expression,
    builder: M,
    or = false,
    propertyTransform = (p) => p
  ) {
    debug("Iterating through", expression);

    builder[or ? "orWhere" : "where"]((subQueryBuilder) => {
      // Assume equality if the target expression is a primitive
      if (typeof expression !== "object") {
        return onLiteral(expression, subQueryBuilder);
      }

      for (const lhs in expression as ExpressionObject) {
        const rhs = expression[lhs];
        debug(`Handling lhs[${lhs}] rhs[${JSON.stringify(rhs)}]`);

        if (hasSubExpression(lhs, rhs)) {
          // Wrap nested conditions in their own scope
          subQueryBuilder.where((innerBuilder) => {
            for (const subExpression of arrayize(rhs)) {
              iterator(
                subExpression,
                innerBuilder,
                lhs === OR,
                propertyTransform
              );
            }
          });
        } else {
          // The lhs is either a non-logical operator or a property name
          debug("onExit", propertyTransform(lhs), rhs);
          onExit(propertyTransform(lhs), rhs, subQueryBuilder);
        }
      }
    });
  };

  return iterator;
}
