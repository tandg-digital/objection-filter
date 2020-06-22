/**
 * The utils helpers are a set of common helpers to be passed around during
 * filter execution. It stores all default operators, custom operators and
 * functions which directly touch these operators.
 */

import { debug } from '../config';
import { iterateLogicalExpression } from './LogicalIterator';

// Types
import { Model, QueryBuilder, PrimitiveValue } from  'objection';
import {
  Relation,
  Operators,
  OperationOptions,
  OperationUtils,
  LogicalIteratorExitFunction,
  LogicalIteratorLiteralFunction,
  Expression,
  ExpressionValue,
  Primitive
} from './types';

/**
 * For a property "a.b.c", slice it into relationName: "a.b", "propertyName": "c" and
 * a fully qualified property "a:b.c"
 * @param {String} relatedProperty A dot notation property "a.b.c"
 * @param {String} delimiter A delimeter to use on the relation e.g. "." or ":"
 */
export function sliceRelation(
  relatedProperty: string,
  delimiter: string = '.',
  rootTableName?: string
): Relation {
  const split = relatedProperty.split('.');
  const propertyName = split[split.length - 1];
  const relationName = split.slice(0, split.length - 1).join(delimiter);

  // Nested relations need to be in the format a:b:c.name
  // https://github.com/Vincit/objection.js/issues/363
  const fullyQualifiedProperty = relationName
    ? `${relationName.replace(/\./g, ':')}.${propertyName}`
    : rootTableName ? `${rootTableName}.${propertyName}` : propertyName;

  return { propertyName, relationName, fullyQualifiedProperty };
};

/**
 * Create operation application utilities with some custom options
 * If options.operators is specified
 * @param {Object} options.operators
 * @param {Function} options.onAggBuild A utility function to filter aggregations per model
 */
export function Operations<M extends Model>(options: OperationOptions<M>): OperationUtils<M> {
  const defaultOperators: Operators<M> = {
    $like: (property, operand, builder) => builder
      .where(property, 'like', operand as string),
    $lt: (property, operand, builder) => builder
      .where(property, '<', operand as number),
    $gt: (property, operand, builder) => builder
      .where(property, '>', operand as number),
    $lte: (property, operand, builder) => builder
      .where(property, '<=', operand as number),
    $gte: (property, operand, builder) => builder
      .where(property, '>=', operand as number),
    $equals: (property, operand, builder) => builder
      .where(property, operand as PrimitiveValue),
    '=': (property, operand, builder) => builder
      .where(property, operand as PrimitiveValue),
    $in: (property, operand, builder) => builder
      // @ts-ignore
      .whereIn(property, operand as ExpressionValue[]),
    $exists: (property, operand, builder) => (operand
      ? builder.whereNotNull(property)
      : builder.whereNull(property)
    ),
    /**
     * @param {String} property
     * @param {Array} items Must be an array of objects/values
     * @param {QueryBuilder} builder
     */
    $or: (property, items, builder) => {
      const onExit: LogicalIteratorExitFunction<M> = function(operator, value, subQueryBuilder) {
        const operationHandler = allOperators[operator];
        operationHandler(property, value, subQueryBuilder);
      };
      const onLiteral: LogicalIteratorLiteralFunction<M> = function(value, subQueryBuilder) {
        onExit('$equals', value, subQueryBuilder);
      };

      // Iterate the logical expression until it hits an operation e.g. $gte
      // @ts-ignore
      const iterateLogical = iterateLogicalExpression<M>({ onExit, onLiteral });

      // Wrap within another builder context to prevent end-of-expression errors
      // TODO: Investigate the consequences of not using this wrapper
      return builder.where(subQueryBuilder => {
        iterateLogical({ $or: items }, subQueryBuilder, true);
      });
    },
    $and: (property, items, builder) => {
      const onExit: LogicalIteratorExitFunction<M> = function(operator, value, subQueryBuilder) {
        const operationHandler = allOperators[operator];
        operationHandler(property, value, subQueryBuilder);
      };
      const onLiteral: LogicalIteratorLiteralFunction<M> = function(value, subQueryBuilder) {
        onExit('$equals', value, subQueryBuilder);
      };

      // Iterate the logical expression until it hits an operation e.g. $gte
      // @ts-ignore
      const iterateLogical = iterateLogicalExpression<M>({ onExit, onLiteral });

      // Wrap within another builder context to prevent end-of-expression errors
      return builder.where(subQueryBuilder => {
        iterateLogical({ $and: items }, subQueryBuilder, false);
      });
    }
  };
  const { operators, onAggBuild } = options;

  // Custom operators override default operators
  const allOperators = { ...defaultOperators, ...operators };

  // TODO: Generalize
  function isPrimitive(expression: ExpressionValue): expression is Primitive {
    return typeof expression !== 'object';
  }

  /**
   * Apply a subset of operators on a single property
   * @param {String} propertyName
   * @param {Object} expression
   * @param {QueryBuilder} builder
   */
  const applyPropertyExpression = function(
    propertyName: string,
    expression: Expression,
    builder: QueryBuilder<M>
  ) {
    debug(
      `Handling property[${propertyName}] expression[${JSON.stringify(expression)}]`
    );

    // If the rhs is a primitive, assume equality
    if (isPrimitive(expression)) return allOperators.$equals(propertyName, expression, builder);

    for (const lhs in expression) {
      const operationHandler = allOperators[lhs];
      const rhs = expression[lhs];

      if (!operationHandler) {
        debug(`The operator [${lhs}] does not exist, skipping`);
        continue;
      }

      operationHandler(propertyName, rhs, builder);
    }
  };

  return { applyPropertyExpression, onAggBuild };
};
