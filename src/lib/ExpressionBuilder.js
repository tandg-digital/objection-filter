const _ = require('lodash');
const {
  sliceRelation
} = require('./utils');

/**
 * Takes a property name, and a tree of sub-relations and recursively builds
 * an objection relation expression e.g. { a: {b: {}, c: {} } } => '[a.[b,c]]'
 * The tree should be of the format { a: { b: {} }}, e.g. empty leaf nodes = {}
 * @param {Object} tree A tree of relations
 * @param {String} relationName The top level relation
 */
const toRelationSubExpression = (tree, relationName) => {
  if (Object.keys(tree).length === 0) return relationName;

  // Recursively apply to all attributes
  const expression = _.map(tree, toRelationSubExpression).join(',');

  // The first time this is called, there is no relationName
  const prefix = relationName ? `${relationName}.` : '';

  return _.keys(tree).length === 1 ?
    `${prefix}${expression}` :
    `${prefix}[${expression}]`;
};

/**
 * Takes an array of fully qualified field names, and concatenates them into a single
 * objection.js relation expression. This avoids joining the same table multiple times
 * e.g. fields = [ 'schema.schemaAttributes.name', 'schema.organization.id'] will result in
 * expression = '[schema.[schemaAttributes,organization]]'
 * @param {Array<String>} fields A list of fields
 */
const createRelationExpression = (fields = []) => {
  // For each field, set some arbitrarily deep property
  const tree = {};
  fields.forEach(field => {
    const { relationName, propertyName } = sliceRelation(field);
    if (!relationName) return;

    // Set the node of the tree if it doesn't exist yet
    _.set(
      tree,
      relationName,
      _.get(tree, relationName, {})
    );
  });

  // Reduce the property map into a nested expression
  return toRelationSubExpression(tree);
};
module.exports.createRelationExpression = createRelationExpression;