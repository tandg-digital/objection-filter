'use strict';

var _ = require('lodash');

var _require = require('./utils'),
    sliceRelation = _require.sliceRelation;

/**
 * Takes a property name, and a tree of sub-relations and recursively builds
 * an objection relation expression e.g. { a: {b: {}, c: {} } } => '[a.[b,c]]'
 * The tree should be of the format { a: { b: {} }}, e.g. empty leaf nodes = {}
 * @param {Object} tree A tree of relations
 * @param {String} relationName The top level relation
 */


var toRelationSubExpression = function toRelationSubExpression(tree, relationName) {
  if (Object.keys(tree).length === 0) return relationName;

  // Recursively apply to all attributes
  var expression = _.map(tree, toRelationSubExpression).join(',');

  // The first time this is called, there is no relationName
  var prefix = relationName ? relationName + '.' : '';

  return _.keys(tree).length === 1 ? '' + prefix + expression : prefix + '[' + expression + ']';
};

/**
 * Takes an array of fully qualified field names, and concatenates them into a single
 * objection.js relation expression. This avoids joining the same table multiple times
 * e.g. fields = [ 'schema.schemaAttributes.name', 'schema.organization.id'] will result in
 * expression = '[schema.[schemaAttributes,organization]]'
 * @param {Array<String>} fields A list of fields
 */
var createRelationExpression = function createRelationExpression() {
  var fields = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];

  // For each field, set some arbitrarily deep property
  var tree = {};
  fields.forEach(function (field) {
    var _sliceRelation = sliceRelation(field),
        relationName = _sliceRelation.relationName,
        propertyName = _sliceRelation.propertyName;

    if (!relationName) return;

    // Set the node of the tree if it doesn't exist yet
    _.set(tree, relationName, _.get(tree, relationName, {}));
  });

  // Reduce the property map into a nested expression
  return toRelationSubExpression(tree);
};
module.exports.createRelationExpression = createRelationExpression;